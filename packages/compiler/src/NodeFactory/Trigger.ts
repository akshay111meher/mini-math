import { BaseNode, OutputType } from '@mini-math/nodes'

export class TriggerNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const cfg: any = this.nodeDef.data || this.nodeDef.config || {}

    const firstInputObj = this.nodeDef.inputs?.[0]
    const inputData = firstInputObj && (firstInputObj as any).value

    const triggerType = cfg.triggerType || 'manual'

    const resultPayload = {
      type: 'trigger',
      inputData: inputData,
      outputData: { ...(inputData ?? {}) },
      timestamp: new Date().toISOString(),
      triggeredBy: triggerType,
    }

    const output: OutputType = {
      name: 'trigger',
      type: 'json',
      value: resultPayload,
    }

    return [output]
  }
  async cost(): Promise<BigInt> {
    return BigInt(14)
  }
}
