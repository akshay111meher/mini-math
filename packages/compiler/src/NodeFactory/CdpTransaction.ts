import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { cdpService } from './utils/cdpService.js'

interface WalletInfo {
  walletType: string
  accountName: string
  network?: string
}

interface WalletGlobalState {
  wallet?: WalletInfo
}

const CdpTransactionNodeConfigSchema = z.object({
  recipientAddress: z.string(),
  amount: z.string(),
  tokenType: z.string().optional().default('eth'),
  customTokenAddress: z.string().optional(),
  gasLimit: z.string().optional(),
  description: z.string().optional(),
  uiMode: z.string().optional().default('autonomous'),
})

type CdpTransactionNodeConfig = z.infer<typeof CdpTransactionNodeConfigSchema>

export class CdpTransactionNode extends BaseNode {
  private readonly logger: Logger

  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`CdpTransactionNode: ${this.nodeDef.id}`)
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: CdpTransactionNodeConfig = CdpTransactionNodeConfigSchema.parse(raw)

    // Check for manual mode in config or global state
    // The user wants "manual wallet flow not implemented" if it's manual.
    // We check the wallet info from global state.
    const globalState = this.workflowGlobalState.getGlobalState<WalletGlobalState>() ?? {}
    const walletInfo = globalState.wallet

    if (!walletInfo) {
      // If no wallet info, maybe it's manual or not initialized.
      // But if the previous node was manual wallet, it would have thrown.
      // If we are here, maybe we should check if we are in manual mode from config?
      if (nodeConfig.uiMode === 'manual') {
        throw new Error('Manual wallet flow not implemented')
      }
      throw new Error('No wallet connection found')
    }

    if (walletInfo.walletType === 'masterwallet-manual') {
      throw new Error('Manual wallet flow not implemented')
    }

    const { recipientAddress, amount, tokenType, customTokenAddress, description } = nodeConfig
    const network = walletInfo.network || 'base-sepolia'
    const accountName = walletInfo.accountName

    let result
    if (tokenType === 'eth') {
      // Use transferWithSmartAccount for ETH (it handles it as a token or native?)
      // cdpService.transferWithSmartAccount takes 'token' param.
      // If token is 'eth', it should work if cdpService handles it, or we use sendTransaction.
      // Looking at cdpService.ts: transferWithSmartAccount uses cdpAccount.transfer.
      // cdpAccount.transfer docs say it handles assets.

      result = await cdpService.transferWithSmartAccount({
        accountName,
        network,
        to: recipientAddress,
        amount,
        token: 'eth', // Assuming 'eth' is valid for cdp sdk
        description,
        waitForConfirmation: true,
      })
    } else {
      // Custom token
      const token = customTokenAddress || tokenType
      result = await cdpService.transferWithSmartAccount({
        accountName,
        network,
        to: recipientAddress,
        amount,
        token,
        description,
        waitForConfirmation: true,
      })
    }

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: 'main',
      type: 'json',
      value: result,
    }

    return [out]
  }

  protected async _cost(): Promise<bigint> {
    return BigInt(2)
  }
}
