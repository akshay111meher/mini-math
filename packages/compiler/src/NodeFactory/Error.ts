import { BaseNode, OutputType } from '@mini-math/nodes'

export class ErrorNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    throw new Error('purpose fully throw error')
  }
  protected async _cost(): Promise<bigint> {
    return BigInt(1)
  }
}
