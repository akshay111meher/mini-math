import { BaseNode, OutputType } from '@mini-math/nodes'

export class WalletNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const cfg: any = this.nodeDef.data || this.nodeDef.config || {}

    const chainId = cfg.chainId || '11155111' // default to Sepolia

    const firstInputObj = this.nodeDef.inputs?.[0]
    const inputData = firstInputObj && (firstInputObj as any).value

    const walletData = {
      chainId,
      nodeId: this.nodeDef.id,
      timestamp: new Date().toISOString(),
    }

    const resultPayload = {
      type: 'wallet',
      walletData,
      outputData: {
        ...(inputData ?? {}),
        wallet: walletData,
      },
      timestamp: new Date().toISOString(),
    }

    const output: OutputType = {
      name: 'wallet',
      type: 'json',
      value: resultPayload,
    }

    return [output]
  }
}
