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

    const SECRET_IDENTIFIER = 'TEST_SECRET'
    const secret = this.workflowGlobalState.getSecret(SECRET_IDENTIFIER)
    if (secret) {
      this.logger.debug(`Found Secret: ${SECRET_IDENTIFIER} with value: ${secret}`)
    } else {
      this.logger.warn(`Secret: ${SECRET_IDENTIFIER} Not Found`)
    }

    let externalInputIds = (this.nodeDef.externalInputs || []).map((a) => a.id)
    if (externalInputIds) {
      // if defined let see whether they are visible here
      for (let index = 0; index < externalInputIds.length; index++) {
        const externalInputId = externalInputIds[index]

        //1. you can read the previous nodes externalINputs also, (and ofcourse not future ones that will be executed during workflow)
        //2. preferable always read current nodes inputs only
        //3. Better practice would be to append to global state of workflow, if same inputs are required in future (debatable)
        const externalInputData = this.workflowGlobalState.readExternalInput(
          this.nodeDef.id,
          externalInputId,
        )

        if (externalInputData) {
          this.logger.info(
            `found: externalInput: ${externalInputId} with data: ${JSON.stringify(externalInputData)}`,
          )
        } else {
          this.logger.error(
            `not data found: externalInput: ${externalInputId}. This should not have occurred`,
          )
        }
      }
    }
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
