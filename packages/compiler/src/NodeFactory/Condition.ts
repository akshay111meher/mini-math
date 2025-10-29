import { BaseNode, OutputType } from '@mini-math/nodes'

export class ConditionNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    throw new Error('method not implemented')
  }
}
