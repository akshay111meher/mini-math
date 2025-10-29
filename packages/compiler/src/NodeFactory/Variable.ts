import { BaseNode, OutputType } from '@mini-math/nodes'

export class VariableNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    throw new Error('method not implemented')
  }
}
