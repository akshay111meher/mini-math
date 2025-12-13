import {
  ExecutableNodeBase,
  ExecutionResult,
  NodeDefType,
  OutputType,
  InputType,
  WorkflowGlobalState,
} from './types/index.js'

import { Logger, makeLogger } from '@mini-math/logger'

import { ERROR_CODES } from './errors.js'

export abstract class BaseNode implements ExecutableNodeBase {
  protected nodeDef: NodeDefType
  protected workflowGlobalState: WorkflowGlobalState
  protected nodeName: string
  protected logger: Logger

  constructor(
    nodeDef: NodeDefType,
    workflowGlobalState: WorkflowGlobalState,
    factory: string,
    nodeName: string,
  ) {
    this.nodeDef = nodeDef
    this.workflowGlobalState = workflowGlobalState
    this.nodeName = nodeName
    this.logger = makeLogger(factory, {
      nodeId: this.nodeDef.id,
      nodeName,
      workflowId: workflowGlobalState.workflowId(),
    })
  }

  public readInputs(): InputType[] {
    return this.nodeDef.inputs
  }

  public readOutputs(): OutputType[] {
    if (!this.nodeDef.executed) throw new Error(ERROR_CODES.NODE_IS_NOT_EXECUTED)

    return this.nodeDef.outputs
  }

  protected abstract _nodeExecutionLogic(): Promise<OutputType[]>
  protected abstract _cost(): Promise<bigint>

  public async estimatedCostBeforeExecution(): Promise<bigint> {
    return this._cost()
  }

  public async execute(): Promise<ExecutionResult> {
    // Option A: refuse re-execution at node level and surface that as 'error'
    if (this.nodeDef.executed) {
      return {
        status: 'error',
        payload: {
          nodeId: this.nodeDef.id,
          outputs: this.nodeDef.outputs ?? [],
          errorCode: ERROR_CODES.NODE_IS_ALREADY_EXECUTED,
        },
      }
    }

    // Run the node's real logic — but do not mutate nodeDef here.
    const outputs = await this._nodeExecutionLogic()

    // Return a description of what happened.
    return {
      status: 'ok',
      payload: {
        nodeId: this.nodeDef.id,
        outputs,
      },
      // next?: can be set by subclasses if they want to branch
      // terminateRun?: can also be set in subclass
    }
  }
}
