import { BaseNode, OutputType } from '@mini-math/nodes'
import { makeLogger } from '@mini-math/logger'
import { v4 as uuidv4 } from 'uuid'

const logger = makeLogger('TriggerNode')
export class TriggerNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const nodeConfig: any = this.nodeDef.data ?? this.nodeDef.config ?? {}

    logger.info(`Executing trigger node ${this.nodeDef.id}`, {
      inputData: this.readInputs(),
      triggerType: nodeConfig.triggerType,
    })

    const out: Extract<OutputType, { type: 'boolean' }> = {
      id: uuidv4(),
      name: 'trigger',
      type: 'boolean',
      value: true,
    }

    return [out]
  }
  protected async _cost(): Promise<bigint> {
    return BigInt(14)
  }
}
