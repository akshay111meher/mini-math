import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { v4 as uuidv4 } from 'uuid'

export class TestNode extends BaseNode {
  private readonly logger: Logger
  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`TestNode: ${this.nodeDef.id}`)
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const globalState = this.workflowGlobalState.getGlobalState<string[]>() || []
    globalState.push(this.nodeDef.name || this.nodeDef.id)
    this.workflowGlobalState.setGlobalState(globalState)

    const out: Extract<OutputType, { type: 'string' }> = {
      id: uuidv4(),
      name: 'trigger',
      type: 'string',
      value: this.nodeDef.name || this.nodeDef.id,
    }

    return [out]
  }
  protected async _cost(): Promise<bigint> {
    return BigInt(0)
  }
}
