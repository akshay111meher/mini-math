import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { createHash, randomBytes } from 'crypto'
import { keccak256, toBytes, Chain } from 'viem'
import { CdpService, EIP712Domain } from './utils/cdpService.js'

// 1inch Fusion Plus CDP flow (quote -> build -> sign with CDP -> submit -> status),
// Ported from backend `backend/src/routes/fusionplusCdp.ts` and `utils/fusionplus/*`.

// Fusion Plus API base URL (matches backend/src/utils/fusionplus/apiconfig.ts)
const FUSION_PLUS_BASE_URL_DEFAULT = 'https://api.1inch.com/fusion-plus'

interface FusionApiConfig {
  authKey: string
  baseUrl?: string
}

const AppNetworkEnum = z.enum([
  'ethereum',
  'base',
  'base-sepolia',
  'polygon',
  'bsc',
  'arbitrum',
  'optimism',
])

type AppNetworkName = z.infer<typeof AppNetworkEnum>

export const FusionSubmitOrderPayloadSchema = z.object({
  order: z.record(z.string(), z.unknown()),
  srcChainId: z.number(),
  signature: z.string(),
  extension: z.string(),
  quoteId: z.string(),
  secretHashes: z.array(z.string()).optional(),
})
type FusionSubmitOrderPayload = z.infer<typeof FusionSubmitOrderPayloadSchema>

// Map network name to numeric chain ID (same mapping used in WorkflowEngine)
function getChainId(chainName: AppNetworkName): number {
  const chainMap: Record<AppNetworkName, number> = {
    ethereum: 1,
    base: 8453,
    'base-sepolia': 84532,
    polygon: 137,
    bsc: 56,
    arbitrum: 42161,
    optimism: 10,
  }
  return chainMap[chainName] || 1
}

// Mirror accountNameV1 logic used in mini-math CDP router (SHA-256, 24 chars + '00')
function accountNameV1(address: string): string {
  const normalized = address.trim().toLowerCase()
  const digest = createHash('sha256').update(normalized).digest('hex')
  const base = digest.slice(0, 24)
  return `${base}00`
}

function toWei(amountHuman: string, decimals: number): string {
  const [whole, frac = ''] = String(amountHuman).split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  try {
    const wholeBig = BigInt(whole || '0').toString()
    return wholeBig + (fracPadded ? fracPadded : '')
  } catch {
    return '0'
  }
}

// ==== Fusion Plus helper functions (ported from backend utils/fusionplus/*) ====

/**
 * Get Fusion Plus quote for cross-chain swap
 * Ported from backend/src/utils/fusionplus/getQuote.ts
 */
async function fusionPlusGetQuote(
  params: {
    srcChain: number
    dstChain: number
    srcTokenAddress: string
    dstTokenAddress: string
    amount: string
    walletAddress: string
    enableEstimate?: boolean
    slippage?: number
    fee?: number
    source?: string
    isPermit2?: string
    permit?: string
  },
  config: FusionApiConfig,
): Promise<unknown> {
  const baseUrl = config.baseUrl || FUSION_PLUS_BASE_URL_DEFAULT

  const {
    srcChain,
    dstChain,
    srcTokenAddress,
    dstTokenAddress,
    amount,
    walletAddress,
    enableEstimate = true,
    fee,
    slippage,
    source,
    isPermit2,
    permit,
  } = params

  const queryParams = new URLSearchParams({
    srcChain: srcChain.toString(),
    dstChain: dstChain.toString(),
    srcTokenAddress,
    dstTokenAddress,
    amount,
    walletAddress,
    enableEstimate: String(enableEstimate),
  })

  if (fee !== undefined) {
    queryParams.append('fee', fee.toString())
  }
  if (isPermit2) {
    queryParams.append('isPermit2', isPermit2)
  }
  if (permit) {
    queryParams.append('permit', permit)
  }
  if (source) {
    queryParams.append('source', source)
  }
  if (slippage !== undefined) {
    queryParams.append('slippage', slippage.toString())
  }

  const url = `${baseUrl}/quoter/v1.1/quote/receive?${queryParams.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.authKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Failed to get Fusion Plus quote: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`,
    )
  }

  return await res.json()
}

/**
 * Build Fusion Plus EVM order
 * Ported from backend/src/utils/fusionplus/buildOrder.ts
 */
async function fusionPlusBuildEvmOrder(
  quoteId: string,
  body: {
    secretsHashList: string[]
    preset: string
    receiver?: string
    permit?: string
    isPermit2?: boolean
  },
  config: FusionApiConfig,
  isMobile?: boolean,
): Promise<unknown> {
  const baseUrl = config.baseUrl || FUSION_PLUS_BASE_URL_DEFAULT

  const queryParams = new URLSearchParams({ quoteId })
  if (isMobile !== undefined) {
    queryParams.append('isMobile', String(isMobile))
  }

  const url = `${baseUrl}/quoter/v1.1/quote/build/evm?${queryParams.toString()}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.authKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Failed to build Fusion Plus order: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`,
    )
  }

  return await res.json()
}

/**
 * Submit Fusion Plus order
 * Ported from backend/src/utils/fusionplus/submitOrder.ts
 * Note: srcChainId must be at top level, NOT inside order object
 */
async function fusionPlusSubmitOrder(
  body: {
    order: Record<string, unknown>
    srcChainId: number
    signature: string
    extension: string
    quoteId: string
    secretHashes?: string[]
  },
  config: FusionApiConfig,
): Promise<unknown> {
  const baseUrl = config.baseUrl || FUSION_PLUS_BASE_URL_DEFAULT
  const url = `${baseUrl}/relayer/v1.1/submit`

  // Build clean payload with srcChainId at top level
  const payload: FusionSubmitOrderPayload = {
    order: body.order,
    srcChainId: body.srcChainId,
    signature: body.signature,
    extension: body.extension,
    quoteId: body.quoteId,
  }

  // Only include secretHashes for multiple fills (not for single fill)
  if (body.secretHashes && body.secretHashes.length > 1) {
    payload.secretHashes = body.secretHashes
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.authKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Failed to submit Fusion Plus order: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`,
    )
  }

  // Handle empty or non-JSON responses (success case)
  const responseText = await res.text()
  if (!responseText || responseText.trim() === '') {
    return {
      orderHash: body.order.salt,
      success: true,
      message: 'Order submitted successfully',
    }
  }

  try {
    return JSON.parse(responseText)
  } catch {
    return {
      orderHash: body.order.salt,
      success: true,
      message: 'Order submitted successfully',
    }
  }
}

/**
 * Get Fusion Plus order status
 * Ported from backend/src/utils/fusionplus/getOrders.ts
 */
async function fusionPlusGetOrderStatus(
  orderHash: string,
  config: FusionApiConfig,
): Promise<unknown> {
  const baseUrl = config.baseUrl || FUSION_PLUS_BASE_URL_DEFAULT
  const url = `${baseUrl}/orders/v1.1/order/status/${orderHash}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.authKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Failed to get Fusion Plus order status: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`,
    )
  }

  return await res.json()
}

/**
 * Generate secrets and their keccak256 hashes
 * Ported from backend/src/routes/fusionplusCdp.ts secrets endpoint
 */
function generateSecrets(secretsCount: number = 1): {
  secrets: string[]
  secretHashes: string[]
} {
  if (secretsCount <= 0 || secretsCount > 32 || !Number.isInteger(secretsCount)) {
    throw new Error('Invalid secretsCount. Provide an integer between 1 and 32 (inclusive)')
  }

  const secrets: string[] = Array.from({ length: secretsCount }, () => {
    const secretBytes = randomBytes(32)
    return `0x${secretBytes.toString('hex')}` as `0x${string}`
  })

  const secretHashes: string[] = secrets.map((secret) => {
    return keccak256(toBytes(secret as `0x${string}`))
  })

  return { secrets, secretHashes }
}

/**
 * Get ready to accept secret fills for an order
 * Ported from backend/src/utils/fusionplus/getOrders.ts
 */
async function fusionPlusGetReadyToAcceptSecretFills(
  orderHash: string,
  config: FusionApiConfig,
): Promise<unknown> {
  const baseUrl = config.baseUrl || FUSION_PLUS_BASE_URL_DEFAULT
  const url = `${baseUrl}/orders/v1.1/order/ready-to-accept-secret-fills/${orderHash}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.authKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Failed to get ready to accept secret fills: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`,
    )
  }

  return await res.json()
}

/**
 * Submit secret for order fill
 * Ported from backend/src/utils/fusionplus/submitSecret.ts
 */
async function fusionPlusSubmitSecret(
  secret: string,
  orderHash: string,
  config: FusionApiConfig,
): Promise<unknown> {
  const baseUrl = config.baseUrl || FUSION_PLUS_BASE_URL_DEFAULT
  const url = `${baseUrl}/relayer/v1.1/submit/secret`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.authKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ secret, orderHash }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `Failed to submit secret: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`,
    )
  }

  // 201 status means success
  if (res.status === 201) {
    return {
      success: true,
      message: 'The secret has been successfully saved',
    }
  }

  return await res.json()
}

/**
 * Check token allowance using viem public client
 * Ported from backend/src/routes/fusionplusCdp.ts check-approval endpoint
 */
async function checkTokenAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId: number,
): Promise<{ currentAllowance: string; needsApproval: boolean }> {
  const { createPublicClient, http } = await import('viem')
  const chains = await import('viem/chains')

  // Map chainId to known chains or use a generic RPC
  const chainMap: Record<number, Chain> = {
    1: chains.mainnet,
    8453: chains.base,
    84532: chains.baseSepolia,
    137: chains.polygon,
    56: chains.bsc,
    42161: chains.arbitrum,
    10: chains.optimism,
  }

  // Get RPC URL from environment or use default
  const rpcUrlMap: Record<number, string> = {
    1: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    84532: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    137: process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com',
    56: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    42161: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    10: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
  }

  const chain = chainMap[chainId] || {
    id: chainId,
    name: `Chain ${chainId}`,
    network: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  }

  const rpcUrl = rpcUrlMap[chainId] || `https://rpc.ankr.com/eth_${chainId}`

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  })

  // ERC20 allowance ABI
  const allowanceAbi = [
    {
      inputs: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
      ],
      name: 'allowance',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  try {
    const allowance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: allowanceAbi,
      functionName: 'allowance',
      args: [ownerAddress as `0x${string}`, spenderAddress as `0x${string}`],
    })

    return {
      currentAllowance: allowance.toString(),
      needsApproval: allowance === 0n,
    }
  } catch {
    // If reading fails, assume no allowance
    return {
      currentAllowance: '0',
      needsApproval: true,
    }
  }
}

/**
 * Approve token for escrow factory
 * Ported from backend/src/routes/fusionplusCdp.ts approve-token endpoint
 */
async function approveTokenForEscrow(
  cdpService: CdpService,
  accountName: string,
  network: string,
  tokenAddress: string,
  escrowFactoryAddress: string,
  amount: string,
): Promise<{ transactionHash: string }> {
  const result = await cdpService.invokeContract({
    accountName,
    network,
    contractAddress: tokenAddress,
    abi: [
      {
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ],
    method: 'approve',
    args: [escrowFactoryAddress, amount],
    gasLimit: '100000',
    priority: 'medium',
    description: 'Approve token for Fusion Plus escrow',
  })

  return {
    transactionHash: result.transactionHash,
  }
}

export class OneInchNode extends BaseNode {
  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState, factory: string) {
    super(nodeDef, workflowGlobalStateRef, factory, 'OneInchNode')
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const TokenSchema = z.object({
      symbol: z.string().min(1),
      address: z.string().min(1),
      decimals: z.number().int().nonnegative(),
    })

    const ConfigSchema = z.object({
      chain: AppNetworkEnum.default('ethereum'),
      dstChain: AppNetworkEnum.default('base'),
      walletType: z.string().optional().default('masterwallet-manual'),
      walletAddress: z.string().min(1),
      fromToken: TokenSchema,
      toToken: TokenSchema,
      amount: z
        .string()
        .min(1, 'Amount is required and must be greater than 0')
        .refine((val) => {
          const num = parseFloat(val)
          return !isNaN(num) && num > 0
        }, 'Amount must be a valid positive number'),
      recipient: z.string().optional().default(''),
      preset: z.string().optional().default('recommended'),
      cdpAccountName: z.string().optional(),
      resultVariableName: z.string().optional().default('oneInchFusionResult'),
      // Optional: Auto-approve token if needed (default: true)
      autoApprove: z.boolean().optional().default(true),
      // Optional: Auto-submit secrets when ready (default: false, as it requires polling)
      autoSubmitSecrets: z.boolean().optional().default(false),
      // Optional: Max attempts for secret submission polling
      maxSecretPollAttempts: z.number().optional().default(20),
    })

    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const rawConfig =
      typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

    // Try to get chain and walletAddress from global state (from upstream nodes)
    const globalState =
      this.workflowGlobalState.getGlobalState<{
        wallet?: { network?: string; address?: string; ownerAddress?: string; accountName: string }
      }>() ?? {}
    const walletInfo = globalState.wallet

    // Determine chain for token resolution and execution
    // Priority: 1) explicit config.chain, 2) walletInfo.network (from upstream wallet node), 3) default 'ethereum'
    // Note: For cross-chain swaps, the source chain should match where the wallet/tokens are located
    // If chain is not explicitly set in config, use wallet network, but ensure it's different from dstChain
    const chain = (rawConfig.chain || walletInfo?.network || 'ethereum') as AppNetworkName
    const dstChain = (rawConfig.dstChain || 'base') as AppNetworkName

    // Resolve token symbols to token objects if needed
    const resolveToken = async (
      tokenInput: unknown,
      chainName: AppNetworkName,
      tokenType: 'from' | 'to',
    ): Promise<{ symbol: string; address: string; decimals: number }> => {
      // If already a token object, return it
      if (
        tokenInput &&
        typeof tokenInput === 'object' &&
        'symbol' in tokenInput &&
        'address' in tokenInput &&
        'decimals' in tokenInput
      ) {
        return tokenInput as { symbol: string; address: string; decimals: number }
      }

      // If it's a string (symbol), resolve it from 1inch token list
      if (typeof tokenInput === 'string' && tokenInput.length > 0) {
        const symbol = tokenInput.toUpperCase()
        const chainId = getChainId(chainName)

        this.logger.info(
          `Resolving ${tokenType} token symbol "${symbol}" for chain ${chainName} (${chainId})`,
        )

        try {
          const apiKey = process.env.ONE_INCH_KEY
          if (!apiKey) {
            throw new Error('ONE_INCH_KEY not configured')
          }

          // Fetch token list from 1inch API
          const response = await fetch(`https://api.1inch.dev/token/v1.2/${chainId}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch token list: ${response.status} ${response.statusText}`)
          }

          const tokenList = (await response.json()) as object

          // Find token by symbol (case-insensitive)
          // 1inch returns object keyed by lowercase address, value contains token data
          let tokenAddress: string | undefined
          let tokenData: { symbol: string; decimals: number } | undefined

          for (const [address, data] of Object.entries(tokenList)) {
            if (data?.symbol && data.symbol.toUpperCase() === symbol) {
              tokenAddress = address
              tokenData = data
              break
            }
          }

          if (!tokenAddress || !tokenData) {
            throw new Error(
              `Token "${symbol}" not found in 1inch token list for chain ${chainName}`,
            )
          }

          const resolvedToken = {
            symbol: tokenData.symbol || symbol,
            address: tokenAddress, // Use the key (lowercase address) as the address
            decimals: tokenData.decimals || 18,
          }

          this.logger.info(`Resolved ${tokenType} token:`, {
            symbol: resolvedToken.symbol,
            address: resolvedToken.address,
            decimals: resolvedToken.decimals,
          })

          return resolvedToken
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          this.logger.error(`Failed to resolve ${tokenType} token "${symbol}":`, {
            error: errorMessage,
          })
          throw new Error(
            `Failed to resolve ${tokenType} token "${symbol}" for chain ${chainName}: ${errorMessage}`,
          )
        }
      }

      throw new Error(
        `Invalid ${tokenType} token format: expected object with {symbol, address, decimals} or a token symbol string, got ${typeof tokenInput}`,
      )
    }

    // Resolve tokens if they're strings
    let fromToken = rawConfig.fromToken
    let toToken = rawConfig.toToken

    if (
      typeof fromToken === 'string' ||
      (fromToken && typeof fromToken === 'object' && !('address' in fromToken))
    ) {
      fromToken = await resolveToken(fromToken, chain, 'from')
    }

    if (
      typeof toToken === 'string' ||
      (toToken && typeof toToken === 'object' && !('address' in toToken))
    ) {
      toToken = await resolveToken(toToken, dstChain, 'to')
    }

    // Merge config with global state values if not present in config
    const mergedConfig: Record<string, unknown> = {
      ...rawConfig,
      // Use chain from global state if not in config
      chain,
      dstChain,
      // Prefer wallet info from upstream wallet node (matches old backend behavior)
      walletAddress:
        walletInfo?.address ||
        walletInfo?.ownerAddress ||
        rawConfig.walletAddress ||
        rawConfig.ownerAddress ||
        '',
      // Use resolved tokens
      fromToken,
      toToken,
      // Ensure amount is not empty - provide default or throw clear error
      amount:
        rawConfig.amount && String(rawConfig.amount).trim() !== ''
          ? String(rawConfig.amount).trim()
          : rawConfig.amount, // Keep original to let zod validation handle it with better error
    }

    const cfg = ConfigSchema.parse(mergedConfig)

    const apiKey = process.env.ONE_INCH_KEY
    if (!apiKey) {
      this.logger.error('ONE_INCH_KEY is not set in environment')
      throw new Error('ONE_INCH_KEY is not configured on the server')
    }

    // Resolve CDP subwallet account name and address
    // Prefer upstream wallet info (accountName + address) if provided, else derive
    const walletAddressInput = cfg.walletAddress.trim().toLowerCase()
    const userWalletAddress = walletAddressInput
    if (!walletAddressInput || !walletAddressInput.startsWith('0x')) {
      throw new Error('Invalid or missing user wallet address for 1inch Fusion node')
    }

    const upstreamAccountName =
      walletInfo?.accountName && typeof walletInfo.accountName === 'string'
        ? (walletInfo.accountName as string)
        : null

    const cdpService = CdpService.getInstance()
    // accountNameV1 is async; ensure we await it so we pass a string to CDP
    let derivedAccountName = upstreamAccountName ?? (await accountNameV1(walletAddressInput))
    let cdpAccount = await cdpService.createOrGetAccount(derivedAccountName)
    let cdpWalletAddress = cdpAccount.address

    // If upstream provided an address and it differs from the derived account, prefer the upstream pairing
    if (
      walletInfo?.address &&
      walletInfo.address.toLowerCase() !== cdpWalletAddress.toLowerCase()
    ) {
      // Attempt to use upstream accountName if available
      if (upstreamAccountName) {
        const upstreamAccount = await cdpService.createOrGetAccount(upstreamAccountName)
        cdpAccount = upstreamAccount
        cdpWalletAddress = upstreamAccount.address
        derivedAccountName = upstreamAccountName
      }
    }

    const srcChainId = getChainId(cfg.chain)
    const dstChainId = getChainId(cfg.dstChain)
    const amountWei = toWei(cfg.amount, cfg.fromToken.decimals)

    // Validate cross-chain requirement
    if (srcChainId === dstChainId) {
      throw new Error(
        `Source and destination chains must be different. Current: ${cfg.chain} -> ${cfg.dstChain}`,
      )
    }

    // 1inch Fusion+ does not support native token as source; fail fast
    const isNativeSrc =
      typeof cfg.fromToken.address === 'string' &&
      cfg.fromToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    if (isNativeSrc) {
      throw new Error(
        'Fusion Plus does not support native tokens as source. Please wrap to WETH/WMATIC/etc. before swapping.',
      )
    }

    this.logger.info(`Starting 1inch Fusion Plus CDP flow`, {
      srcChain: cfg.chain,
      srcChainId,
      dstChain: cfg.dstChain,
      dstChainId,
      fromToken: cfg.fromToken.address,
      toToken: cfg.toToken.address,
      amountHuman: cfg.amount,
      amountWei,
      userWalletAddress,
      cdpAccountName: derivedAccountName,
      cdpWalletAddress,
    })

    // ===== STEP 1: Get Fusion Plus Quote =====
    const fusionConfig: FusionApiConfig = {
      authKey: apiKey,
      baseUrl: process.env.FUSION_PLUS_BASE_URL || FUSION_PLUS_BASE_URL_DEFAULT,
    }

    this.logger.info('Calling Fusion Plus quote', {
      srcChain: srcChainId,
      dstChain: dstChainId,
      srcTokenAddress: cfg.fromToken.address,
      dstTokenAddress: cfg.toToken.address,
      amount: amountWei,
      walletAddress: cdpWalletAddress,
      userWalletAddress: walletAddressInput,
    })

    const quote = await fusionPlusGetQuote(
      {
        srcChain: srcChainId,
        dstChain: dstChainId,
        srcTokenAddress: cfg.fromToken.address,
        dstTokenAddress: cfg.toToken.address,
        amount: amountWei,
        walletAddress: cdpWalletAddress,
        enableEstimate: true,
        source: 'mini-math-cdp-fusion-plus',
      },
      fusionConfig,
    )

    const quoteId = (quote as { quoteId: string }).quoteId as string | undefined
    const quoteResponse = quote as {
      quoteId: string
      recommendedPreset: string
      srcEscrowFactory: string
      dstEscrowFactory?: string
      presets?: Record<
        string,
        {
          secretsCount?: number
        }
      >
    }
    const recommendedPreset =
      (quoteResponse.recommendedPreset as string | undefined) ?? cfg.preset ?? 'fast'

    if (!quoteId) {
      throw new Error('Fusion Plus quote did not return quoteId')
    }

    // Get escrow factory addresses from quote
    const srcEscrowFactory = quoteResponse.srcEscrowFactory as string | undefined
    const dstEscrowFactory = quoteResponse.dstEscrowFactory as string | undefined

    if (!srcEscrowFactory) {
      throw new Error('Fusion Plus quote did not return srcEscrowFactory')
    }

    // Determine secrets count from preset (default to 1 for single fill)
    const presetData = quoteResponse.presets?.[recommendedPreset] as
      | { secretsCount?: number }
      | undefined
    const secretsCount = presetData?.secretsCount ?? 1

    // Generate secrets and hashes
    const { secrets, secretHashes } = generateSecrets(secretsCount)

    // ===== STEP 1.5: Check and Approve Token (if needed) =====
    let approvalResult: { transactionHash?: string; needsApproval: boolean } | null = null
    const isNativeToken =
      cfg.fromToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      cfg.fromToken.symbol.toUpperCase() === 'ETH'

    if (!isNativeToken && cfg.autoApprove) {
      try {
        const allowanceCheck = await checkTokenAllowance(
          cfg.fromToken.address,
          cdpWalletAddress,
          srcEscrowFactory,
          srcChainId,
        )

        if (allowanceCheck.needsApproval) {
          this.logger.info('Token approval needed, approving...', {
            token: cfg.fromToken.address,
            escrowFactory: srcEscrowFactory,
            amount: amountWei,
          })

          const approveResult = await approveTokenForEscrow(
            cdpService,
            derivedAccountName,
            cfg.chain,
            cfg.fromToken.address,
            srcEscrowFactory,
            amountWei,
          )

          approvalResult = {
            transactionHash: approveResult.transactionHash,
            needsApproval: true,
          }

          this.logger.info('Token approval transaction submitted', {
            transactionHash: approveResult.transactionHash,
          })
        } else {
          approvalResult = {
            needsApproval: false,
          }
          this.logger.info('Token already approved, sufficient allowance')
        }
      } catch (error) {
        this.logger.warn('Token approval check/approval failed, continuing anyway', { error })
        // Continue with order flow even if approval fails (might already be approved)
      }
    }

    // ===== STEP 2: Build EVM Order =====
    const buildBody = {
      secretsHashList: secretHashes,
      preset: recommendedPreset,
      receiver: cfg.recipient || cdpWalletAddress,
      // Pass walletAddress explicitly to mirror old backend expectations
      walletAddress: cdpWalletAddress,
    }

    this.logger.info('Calling Fusion Plus build', {
      quoteId,
      buildBody,
    })

    const built = (await fusionPlusBuildEvmOrder(quoteId, buildBody, fusionConfig, false)) as {
      typedData?: {
        domain: Record<string, unknown>
        types: Record<string, Array<{ name: string; type: string }>>
        primaryType: string
        message: Record<string, unknown>
      }
      extension?: string
      orderHash?: string
    }

    const typedData = built.typedData as
      | {
          domain: EIP712Domain
          types: Record<string, Array<{ name: string; type: string }>>
          primaryType: string
          message: Record<string, unknown>
        }
      | undefined
    const extension = (built.extension as string | undefined) ?? '0x'
    const orderHash = built.orderHash as string | undefined

    if (!typedData) {
      this.logger.error('Fusion Plus build response structure', {
        fullResponse: JSON.stringify(built),
        responseKeys: Object.keys(built),
      })
      throw new Error(
        `Fusion Plus build did not return typedData. Response keys: ${Object.keys(built).join(', ')}`,
      )
    }

    if (!orderHash) {
      throw new Error('Fusion Plus build did not return orderHash')
    }

    // Extract order from typedData.message (the order is nested inside the EIP-712 message)
    const order = typedData.message as Record<string, unknown>

    this.logger.info('Fusion Plus build response (order excerpt)', {
      orderMaker: (order.maker as string) || null,
      orderReceiver: (order.receiver as string) || null,
      orderKeys: Object.keys(order),
    })

    if (!orderHash) {
      throw new Error('Fusion Plus build did not return orderHash')
    }

    // Verify that the order's maker address matches the CDP account address
    // The order MUST be signed with the address that matches the maker
    // We do NOT modify the order - we use it exactly as 1inch built it
    const orderMaker = (order.maker as string)?.toLowerCase()
    const cdpAccountAddressLower = cdpWalletAddress.toLowerCase()

    this.logger.info('Order and signing account verification', {
      orderMaker,
      cdpAccountAddress: cdpAccountAddressLower,
      addressesMatch: orderMaker === cdpAccountAddressLower,
      orderKeys: Object.keys(order),
      quoteWalletAddress: cdpWalletAddress,
      receiver: cfg.recipient || cdpWalletAddress,
    })

    // CRITICAL: The order's maker MUST match the address we're signing with
    // If they don't match, the signature will be invalid
    // We do NOT modify the order - we use it exactly as 1inch built it
    // The old backend works because it signs the order as-is from 1inch
    if (orderMaker && orderMaker !== cdpAccountAddressLower) {
      throw new Error(
        `Order maker address (${orderMaker}) does not match CDP account address (${cdpAccountAddressLower}). Cannot sign order with mismatched addresses. The quote was requested with walletAddress: ${cdpWalletAddress}, but 1inch built the order with maker: ${orderMaker}. Ensure the quote and build steps use the correct walletAddress and receiver.`,
      )
    }

    // ===== STEP 3: Sign Order with CDP (EIP-712) =====
    this.logger.info('Signing typed data with CDP', {
      accountName: derivedAccountName,
      accountAddress: cdpWalletAddress,
      primaryType: typedData.primaryType,
      domainName: typedData.domain?.name,
      domainChainId: typedData.domain?.chainId,
      verifyingContract: typedData.domain?.verifyingContract,
    })

    const signResult = await cdpService.signTypedData({
      accountName: derivedAccountName,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    })

    // Extract hex signature string from CDP SDK result
    // CDP SDK may return signature as: string, {r, s, v} object, or {signature: string} object
    const sigRaw = signResult.signature
    let signatureHex: string

    if (typeof sigRaw === 'string') {
      signatureHex = sigRaw
    } else if (sigRaw && typeof sigRaw === 'object') {
      // Check if it's a {r, s, v} signature object
      if ('r' in sigRaw && 's' in sigRaw && 'v' in sigRaw) {
        // Convert {r, s, v} to hex string: 0x + r (32 bytes) + s (32 bytes) + v (1 byte)
        // r and s are 32-byte hex strings, v is recovery id (27 or 28, or 0x1b/0x1c)
        const r = String(sigRaw.r).replace(/^0x/i, '').padStart(64, '0')
        const s = String(sigRaw.s).replace(/^0x/i, '').padStart(64, '0')

        // Handle v: can be number (27, 28) or hex string (0x1b, 0x1c)
        let vValue: number
        if (typeof sigRaw.v === 'number') {
          vValue = sigRaw.v
        } else {
          const vStr = String(sigRaw.v).replace(/^0x/i, '')
          vValue = parseInt(vStr, 16)
        }

        // Convert recovery id (27 or 28) to v byte (0x1b = 27, 0x1c = 28)
        // For EIP-712, v is typically 27 or 28, which we use directly
        const vByte = vValue.toString(16).padStart(2, '0')

        signatureHex = `0x${r}${s}${vByte}`

        this.logger.info('Converted {r, s, v} signature to hex', {
          rLength: r.length,
          sLength: s.length,
          vValue,
          vByte,
          signatureLength: signatureHex.length,
        })
      } else if ('signature' in sigRaw) {
        signatureHex = (sigRaw.signature as string) || String(sigRaw)
      } else {
        signatureHex = String(sigRaw)
      }
    } else {
      signatureHex = String(sigRaw)
    }

    // Ensure signature is properly formatted (0x prefix, 130 hex chars = 65 bytes)
    if (!signatureHex.startsWith('0x')) {
      signatureHex = `0x${signatureHex}`
    }

    // Remove any whitespace
    signatureHex = signatureHex.trim()

    // Validate signature format: should be 0x + 130 hex characters (65 bytes: 32 + 32 + 1)
    const hexPart = signatureHex.slice(2)
    if (hexPart.length !== 130) {
      this.logger.error('Invalid signature length', {
        signatureLength: signatureHex.length,
        hexPartLength: hexPart.length,
        expectedLength: 132, // 0x + 130 hex chars
        signaturePrefix: signatureHex.substring(0, 30),
        sigRawType: typeof sigRaw,
        sigRawValue: JSON.stringify(sigRaw).substring(0, 200),
      })
      throw new Error(
        `Invalid signature format: expected 130 hex characters (65 bytes), got ${hexPart.length}. Signature: ${signatureHex.substring(0, 50)}...`,
      )
    }

    // Validate hex characters only
    if (!/^0x[0-9a-fA-F]{130}$/.test(signatureHex)) {
      this.logger.error('Invalid signature format (non-hex characters)', {
        signaturePrefix: signatureHex.substring(0, 50),
      })
      throw new Error('Invalid signature format: must be hexadecimal (0x + 130 hex chars)')
    }

    // Log signature for debugging (first 20 chars only for security)
    this.logger.info('Extracted and validated signature', {
      signatureLength: signatureHex.length,
      signaturePrefix: signatureHex.substring(0, 20),
      sigRawType: typeof sigRaw,
      userWalletAddress: walletAddressInput,
    })

    // ===== STEP 4: Submit Signed Order =====
    // Ensure order object doesn't have srcChainId (it must be at top level)
    const cleanOrder = { ...order }
    if ('srcChainId' in cleanOrder) {
      delete cleanOrder.srcChainId
    }

    const submitResult = (await fusionPlusSubmitOrder(
      {
        order: cleanOrder,
        srcChainId,
        signature: signatureHex,
        extension,
        quoteId,
        secretHashes: secretHashes.length > 1 ? secretHashes : undefined,
      },
      fusionConfig,
    )) as Record<string, unknown>

    this.logger.info('Fusion Plus submit response', {
      submitResultKeys: Object.keys(submitResult),
      submitResult: submitResult,
      buildOrderHash: orderHash,
    })

    const submittedOrderHash =
      submitResult?.orderHash && typeof submitResult.orderHash === 'string'
        ? (submitResult.orderHash as string)
        : undefined

    // Prefer build orderHash for status (matches old backend), fall back to submit orderHash
    const statusOrderHash = orderHash || submittedOrderHash

    if (!statusOrderHash) {
      throw new Error(
        'Fusion Plus submit did not return an orderHash and build orderHash is missing',
      )
    }

    // ===== STEP 5: Get Order Status =====
    let statusResult: unknown = null
    const maxStatusAttempts = 3
    const statusDelayMs = 2000
    for (let attempt = 0; attempt < maxStatusAttempts; attempt++) {
      try {
        statusResult = await fusionPlusGetOrderStatus(statusOrderHash, fusionConfig)
        break
      } catch (err) {
        if (attempt === maxStatusAttempts - 1) {
          throw err
        }
        await new Promise((resolve) => setTimeout(resolve, statusDelayMs))
      }
    }

    // ===== STEP 6: Auto-submit Secrets (if enabled) =====
    let secretSubmissionResult: unknown = null
    if (cfg.autoSubmitSecrets && submittedOrderHash && secrets.length > 0) {
      this.logger.info('Auto-submit secrets enabled, polling for ready escrows...', {
        orderHash: submittedOrderHash,
        secretsCount: secrets.length,
      })

      const maxAttempts = cfg.maxSecretPollAttempts || 20
      let readyFills = null

      // Poll for ready secrets
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const readyResult = (await fusionPlusGetReadyToAcceptSecretFills(
            submittedOrderHash,
            fusionConfig,
          )) as {
            fills?: unknown[]
          }

          if (
            readyResult.fills &&
            Array.isArray(readyResult.fills) &&
            readyResult.fills.length > 0
          ) {
            readyFills = readyResult
            this.logger.info('Escrows ready for secret submission', {
              fillsCount: readyResult.fills.length,
              attempt: attempt + 1,
            })
            break
          }

          // Wait 5 seconds before next attempt
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000))
          }
        } catch (error) {
          this.logger.warn('Error checking ready secrets, will retry', {
            error,
            attempt: attempt + 1,
          })
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000))
          }
        }
      }

      // Submit secrets if ready
      if (readyFills && readyFills.fills && readyFills.fills.length > 0) {
        const submittedSecrets: Array<{ secret: string; success: boolean; error?: string }> = []

        for (const secret of secrets) {
          try {
            const submitResult = await fusionPlusSubmitSecret(
              secret,
              submittedOrderHash,
              fusionConfig,
            )
            this.logger.debug(JSON.stringify(submitResult))

            submittedSecrets.push({
              secret: secret.substring(0, 10) + '...', // Don't log full secret
              success: true,
            })
            this.logger.info('Secret submitted successfully', {
              secretPrefix: secret.substring(0, 10) + '...',
            })
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error'

            submittedSecrets.push({
              secret: secret.substring(0, 10) + '...',
              success: false,
              error: message,
            })

            this.logger.error('Failed to submit secret', {
              error: message,
              // optional: keep raw error for debugging without breaking types
              rawError: error,
            })
          }
        }

        secretSubmissionResult = {
          readyFills,
          submittedSecrets,
          totalSecrets: secrets.length,
          successfulSubmissions: submittedSecrets.filter((s) => s.success).length,
        }
      } else {
        this.logger.warn('Escrows not ready for secret submission within polling window', {
          maxAttempts,
        })
        secretSubmissionResult = {
          status: 'not_ready',
          message: 'Escrows not ready within polling window',
          maxAttempts,
        }
      }
    }

    const result = {
      type: 'oneInchFusionPlusCdpFlow',
      timestamp: new Date().toISOString(),
      meta: {
        srcChain: cfg.chain,
        srcChainId,
        dstChain: cfg.dstChain,
        dstChainId,
        walletType: cfg.walletType,
        userWalletAddress,
        cdpAccountName: derivedAccountName,
        cdpWalletAddress,
        fromToken: cfg.fromToken,
        toToken: cfg.toToken,
        amountHuman: cfg.amount,
        amountWei,
        preset: recommendedPreset,
        secretsCount,
        recipient: cfg.recipient || cdpWalletAddress,
        srcEscrowFactory,
        dstEscrowFactory,
        autoApprove: cfg.autoApprove,
        autoSubmitSecrets: cfg.autoSubmitSecrets,
      },
      steps: {
        quote,
        approval: approvalResult,
        build: built,
        secrets: {
          // Store secret hashes only (secrets should be kept private)
          secretHashes,
          secretsCount,
          // Note: Actual secrets are not stored for security
        },
        signature: {
          signatureHex,
          signerAddress: signResult.address,
        },
        submit: submitResult,
        status: statusResult,
        secretSubmission: secretSubmissionResult,
      },
      orderHash: submittedOrderHash,
    }

    this.workflowGlobalState.updatePartialState({
      [cfg.resultVariableName]: result,
    })

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: cfg.resultVariableName,
      type: 'json',
      value: result,
    }

    return [out]
  }

  protected async _cost(): Promise<bigint> {
    // Arbitrary small cost for external API call
    return BigInt(5)
  }
}
