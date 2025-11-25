import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { cdpService } from './utils/cdpService.js'
import crypto from 'crypto'

const CdpWalletNodeConfigSchema = z.object({
  walletType: z.string().optional().default('subwallet-auto'),
  network: z.string().optional().default('base-sepolia'),
  checkBalance: z.boolean().optional().default(false),
  requestFaucet: z.boolean().optional().default(false),
  ownerAddress: z.string().optional(),
})

type CdpWalletNodeConfig = z.infer<typeof CdpWalletNodeConfigSchema>

export class CdpWalletNode extends BaseNode {
  private readonly logger: Logger

  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`CdpWalletNode: ${this.nodeDef.id}`)
  }

  private async sha256Hex24(input: string): Promise<string> {
    const hash = crypto.createHash('sha256')
    hash.update(input.trim().toLowerCase())
    const hex = hash.digest('hex')
    return hex.slice(0, 24)
  }

  private async accountNameV1(address: string): Promise<string> {
    const base = await this.sha256Hex24(address)
    return base + '00'
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: CdpWalletNodeConfig = CdpWalletNodeConfigSchema.parse(raw)
    const { walletType, network, checkBalance, requestFaucet, ownerAddress } = nodeConfig



    if (walletType === 'masterwallet-manual') {
      throw new Error('Manual wallet flow not implemented')
    }

    // Resolve account name using ownerAddress if available
    let accountName: string
    if (ownerAddress) {
      accountName = await this.accountNameV1(ownerAddress)
    } else {
      // Fallback if no ownerAddress provided (though it should be there in new JSON)
      this.logger.warn('No ownerAddress provided, using generic account name')
      accountName = `subwallet-${this.nodeDef.id}`
    }


    const account = await cdpService.createOrGetAccount(accountName)

    if (checkBalance) {

    }

    if (requestFaucet) {

      await cdpService.requestFaucet(account.address, network)
    }

    const result = {
      address: account.address,
      network,
      walletType,
      accountName,
      ownerAddress
    }

    // Update global state with wallet info so other nodes can use it
    this.workflowGlobalState.updatePartialState({
      wallet: result
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
    return BigInt(3)
  }
}
