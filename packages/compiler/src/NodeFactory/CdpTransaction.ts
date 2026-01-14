import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { cdpService } from './utils/cdpService.js'
import { getGlobalValue } from './utils/globalState.js'

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

/**
 * Resolve ${varName} style placeholders in a string using:
 * 1. Built-in generic variables (now, today, timestamp, random)
 * 2. The workflow global state (values written by VariableNode, CodeNode, etc.)
 *
 * Unresolved placeholders are left as-is.
 */
const resolveVariablesInString = (raw: string, globalState: Record<string, unknown>): string => {
  if (typeof raw !== 'string' || !raw.includes('${')) return raw

  const genericVars: Record<string, unknown> = {
    now: new Date().toISOString(),
    today: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    random: Math.random(),
  }

  return raw.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const trimmedVarName = varName.trim()

    // 1. Generic variables
    if (Object.prototype.hasOwnProperty.call(genericVars, trimmedVarName)) {
      const value = genericVars[trimmedVarName]
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    }

    // 2. Global state (populated by previous nodes)
    const globalValue = getGlobalValue(globalState, trimmedVarName)
    if (typeof globalValue !== 'undefined') {
      return typeof globalValue === 'object' ? JSON.stringify(globalValue) : String(globalValue)
    }

    // 3. Leave as-is if unresolved
    return match
  })
}

export class CdpTransactionNode extends BaseNode {
  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState, factory: string) {
    super(nodeDef, workflowGlobalStateRef, factory, 'CdpTransactionNode')
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: CdpTransactionNodeConfig = CdpTransactionNodeConfigSchema.parse(raw)

    const globalState = this.workflowGlobalState.getGlobalState<Record<string, unknown>>() ?? {}
    const walletInfo = (globalState as WalletGlobalState).wallet

    if (!walletInfo) {
      if (nodeConfig.uiMode === 'manual') {
        throw new Error('Manual wallet flow not implemented')
      }
      throw new Error('No wallet connection found')
    }

    if (walletInfo.walletType === 'masterwallet-manual') {
      throw new Error('Manual wallet flow not implemented')
    }

    const { recipientAddress, amount, tokenType, customTokenAddress, description } = nodeConfig

    const resolvedRecipientAddress = resolveVariablesInString(recipientAddress, globalState)
    const resolvedAmount = resolveVariablesInString(amount, globalState)

    const network = walletInfo.network || 'base-sepolia'
    const accountName = walletInfo.accountName

    let result
    if (tokenType === 'eth') {
      result = await cdpService.transferWithSmartAccount({
        accountName,
        network,
        to: resolvedRecipientAddress,
        amount: resolvedAmount,
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
        to: resolvedRecipientAddress,
        amount: resolvedAmount,
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
