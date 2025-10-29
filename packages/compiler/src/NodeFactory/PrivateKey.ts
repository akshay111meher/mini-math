import { BaseNode, OutputType } from '@mini-math/nodes'

export class PrivateKeyNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const cfg: any = this.nodeDef.data || this.nodeDef.config || {}

    const privateKey = cfg.privateKey
    const encryptionMethod = cfg.encryptionMethod || 'aes256'
    const description = cfg.description || ''

    if (!privateKey) {
      throw new Error('Private key is required')
    }

    const firstInputObj = this.nodeDef.inputs?.[0]
    const inputData = firstInputObj && (firstInputObj as any).value

    const privateKeyData = {
      privateKey,
      encryptionMethod,
      description,
      nodeId: this.nodeDef.id,
      timestamp: new Date().toISOString(),
    }

    const resultPayload = {
      type: 'privateKey',
      privateKeyData,
      outputData: {
        ...(inputData ?? {}),
        privateKey: privateKeyData,
      },
      timestamp: new Date().toISOString(),
    }

    const output: OutputType = {
      name: 'privateKey',
      type: 'json',
      value: resultPayload,
    }

    return [output]
  }
  async cost(): Promise<BigInt> {
    return BigInt(9)
  }
}
