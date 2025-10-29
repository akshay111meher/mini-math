import {
  ExecutableNodeBase,
  ExecutionResult,
  NodeDefType,
  OutputType,
  InputType,
} from './types/index.js'

import { ERROR_CODES } from './errors.js'

export interface NodeFactoryType {
  make(node: NodeDefType): ExecutableNodeBase
}

export abstract class BaseNode implements ExecutableNodeBase {
  protected nodeDef: NodeDefType
  constructor(nodeDef: NodeDefType) {
    this.nodeDef = nodeDef
  }

  public readInputs(): InputType[] {
    return this.nodeDef.inputs
  }

  public readonly(): OutputType[] {
    if (!this.nodeDef.executed) throw new Error(ERROR_CODES.NODE_IS_NOT_EXECUTED)

    return this.nodeDef.outputs
  }

  protected abstract _nodeExecutionLogic(): Promise<OutputType[]>

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
