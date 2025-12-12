import { CdpClient } from '@coinbase/cdp-sdk'

interface CdpAccount {
  name: string
  address: string
  createdAt: string
}

interface TokenBalance {
  token: {
    network: string
    symbol: string
    name: string
    contractAddress: string
  }
  amount: {
    amount: string
    decimals: number
  }
}

interface TokenBalancesResponse {
  balances: TokenBalance[]
  nextPageToken?: string
}

interface FaucetResponse {
  transactionHash: string
  network: string
  token: string
  address: string
}

const ALLOWED_NETWORKS = ['base-sepolia', 'base', 'ethereum'] as const
type Network = (typeof ALLOWED_NETWORKS)[number]

export function parseNetwork(q: unknown): Network {
  if (typeof q !== 'string') throw new Error('invalid network (q)') // rejects ParsedQs / arrays
  if ((ALLOWED_NETWORKS as readonly string[]).includes(q)) return q as Network
  throw new Error('unsupported network')
}

const ALLOWED_FAUCET = ['base-sepolia', 'ethereum-sepolia'] as const
type FAUCET = (typeof ALLOWED_FAUCET)[number]
export function parseFaucet(q: unknown): FAUCET {
  if (typeof q !== 'string') throw new Error('invalid faucet (q)') // rejects ParsedQs / arrays
  if ((ALLOWED_FAUCET as readonly string[]).includes(q)) return q as FAUCET
  throw new Error('unsupported faucet')
}

const ALLOWED_FAUCET_TOKEN = ['eth', 'usdc', 'eurc', 'cbbtc'] as const
type FAUCET_TOKEN = (typeof ALLOWED_FAUCET_TOKEN)[number]
export function parseFaucetToken(q: unknown): FAUCET_TOKEN {
  if (typeof q !== 'string') throw new Error('invalid faucet token (q)') // rejects ParsedQs / arrays
  if ((ALLOWED_FAUCET_TOKEN as readonly string[]).includes(q)) return q as FAUCET_TOKEN
  throw new Error('unsupported faucet token')
}

// Simple service wrapper for CDP operations used by the account page
class CdpService {
  private client: CdpClient

  constructor() {
    // CdpClient reads credentials from env: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
    this.client = new CdpClient()
  }

  async createOrGetAccount(accountName: string): Promise<CdpAccount> {
    const account = await this.client.evm.getOrCreateAccount({ name: accountName })
    return {
      name: accountName,
      address: account.address,
      createdAt: new Date().toISOString(),
    }
  }

  async getAccount(accountName: string): Promise<CdpAccount | null> {
    try {
      const account = await this.client.evm.getAccount({ name: accountName })
      return {
        name: accountName,
        address: account.address,
        createdAt: new Date().toISOString(),
      }
    } catch {
      return null
    }
  }

  async exportAccount(params: {
    accountName?: string
    address?: string
  }): Promise<{ privateKey: string }> {
    if (!params.accountName && !params.address) {
      throw new Error('Either accountName or address is required')
    }
    const result = await this.client.evm.exportAccount({
      ...(params.accountName ? { name: params.accountName } : {}),
      ...(params.address ? { address: params.address as `0x${string}` } : {}),
    })
    return { privateKey: result }
  }

  async listTokenBalances(
    address: string,
    network: string,
    pageSize?: number,
    pageToken?: string,
  ): Promise<TokenBalancesResponse> {
    const result = await this.client.evm.listTokenBalances({
      address: address as `0x${string}`,
      network: parseNetwork(network),
      pageSize,
      pageToken,
    })
    return {
      balances: result.balances.map((b) => ({
        token: {
          network: b.token.network,
          symbol: b.token.symbol || 'UNKNOWN',
          name: b.token.name || 'Unknown Token',
          contractAddress: b.token.contractAddress,
        },
        amount: {
          amount: b.amount.amount.toString(),
          decimals: b.amount.decimals,
        },
      })),
      nextPageToken: result.nextPageToken,
    }
  }

  async requestFaucet(address: string, network: string, token: string): Promise<FaucetResponse> {
    const result = await this.client.evm.requestFaucet({
      address: address as `0x${string}`,
      network: parseFaucet(network),
      token: parseFaucetToken(token),
    })
    return {
      transactionHash: result.transactionHash,
      network,
      token,
      address,
    }
  }
}

export const cdpService = new CdpService()
