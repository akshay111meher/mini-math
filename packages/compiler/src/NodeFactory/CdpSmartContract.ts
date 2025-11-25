import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { cdpService } from './utils/cdpService.js'

const CdpSmartContractConfigSchema = z.object({
  contractAddress: z.string(),
  abi: z.string(),
  selectedFunction: z.string(),
  parameters: z.array(z.any()).optional().default([]),
  gasLimit: z.string().optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
  uiMode: z.string().optional().default('manual'), // Default to manual if not specified, but we check wallet type
})

type CdpSmartContractConfig = z.infer<typeof CdpSmartContractConfigSchema>

export class CdpSmartContract extends BaseNode {
  private readonly logger: Logger

  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`CdpSmartContract: ${this.nodeDef.id}`)
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: CdpSmartContractConfig = CdpSmartContractConfigSchema.parse(raw)

    const globalState = this.workflowGlobalState.getGlobalState<any>()
    const walletInfo = globalState.wallet

    if (!walletInfo) {
      // If config says manual, reject.
      // The user said "display manual wallet flow not implemented for manual wallet flow"
      // If we don't have a wallet, we can't proceed anyway.
      throw new Error('No wallet connection found')
    }

    if (walletInfo.walletType === 'masterwallet-manual') {
      throw new Error('Manual wallet flow not implemented')
    }

    const { contractAddress, abi, selectedFunction, parameters, gasLimit, priority, description } = nodeConfig
    const network = walletInfo.network || 'base-sepolia'
    const accountName = walletInfo.accountName



    let parsedAbi: any[]
    try {
      parsedAbi = JSON.parse(abi)
    } catch (e) {
      throw new Error('Invalid ABI format')
    }

    const result = await cdpService.invokeContract({
      accountName,
      network,
      contractAddress,
      abi: parsedAbi,
      method: selectedFunction,
      args: parameters,
      gasLimit,
      priority,
      description
    })

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: 'main',
      type: 'json',
      value: result,
    }

    return [out]
  }

  protected async _cost(): Promise<bigint> {
    return BigInt(10)
  }
}
