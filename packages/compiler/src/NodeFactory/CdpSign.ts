import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { CdpSignatureParams, EIP712Domain, EIP712Type, cdpService } from './utils/cdpService.js'

interface WalletInfo {
  walletType: string
  accountName: string
  network?: string
}

interface WalletGlobalState {
  wallet?: WalletInfo
}

const EIP712DomainSchema: z.ZodType<EIP712Domain> = z.object({
  name: z.string(),
  chainId: z.number().int(),
  verifyingContract: z.string(),
  version: z.string().optional(),
  salt: z.string().optional(),
})

const EIP712TypeSchema: z.ZodType<EIP712Type> = z.object({
  name: z.string(),
  type: z.string(),
})

const CdpSignNodeConfigSchema = z.object({
  domain: EIP712DomainSchema,
  types: z.record(z.string(), z.array(EIP712TypeSchema)),
  primaryType: z.string(),
  message: z.record(z.string(), z.unknown()),
})

type CdpSignNodeConfig = z.infer<typeof CdpSignNodeConfigSchema>

export class CdpSignNode extends BaseNode {
  private readonly logger: Logger

  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`CdpSignNode: ${this.nodeDef.id}`)
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}

    const parseIfString = <T>(val: unknown): T =>
      typeof val === 'string' ? (JSON.parse(val) as T) : (val as T)

    const config = { ...(raw as Record<string, unknown>) }
    if (config.domain) config.domain = parseIfString<EIP712Domain>(config.domain)
    if (config.types) config.types = parseIfString<Record<string, EIP712Type[]>>(config.types)
    if (config.message) config.message = parseIfString<Record<string, unknown>>(config.message)

    const nodeConfig: CdpSignNodeConfig = CdpSignNodeConfigSchema.parse(config)

    const globalState = this.workflowGlobalState.getGlobalState<WalletGlobalState>() ?? {}
    const walletInfo = globalState.wallet

    if (!walletInfo) {
      throw new Error('No wallet connection found')
    }

    if (walletInfo.walletType === 'masterwallet-manual') {
      throw new Error('Manual wallet flow not implemented')
    }

    const { domain, types, primaryType, message } = nodeConfig
    const accountName = walletInfo.accountName

    // cdpService.signTypedData expects domain with specific fields.
    // We assume the input domain matches EIP712Domain interface in cdpService.

    const signParams: CdpSignatureParams = {
      accountName,
      domain,
      types,
      primaryType,
      message,
    }

    const result = await cdpService.signTypedData(signParams)

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: 'main',
      type: 'json',
      value: result as unknown as Record<string, unknown>,
    }

    return [out]
  }

  protected async _cost(): Promise<bigint> {
    return BigInt(5)
  }
}
