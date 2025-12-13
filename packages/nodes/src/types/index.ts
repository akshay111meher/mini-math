import { OutputType } from './output.js'

export * from './input.js'
export * from './output.js'
export * from './node.js'
export * from './edge.js'
export * from './workflowGlobalState.js'
export interface ExecutionResult {
  status: 'ok' | 'error'
  next?: string[]
  terminateRun?: boolean

  payload?: {
    nodeId: string
    outputs: OutputType[] // what this node produced
    errorCode?: string // if status === 'error'
    errorData?: unknown // if status == 'error
  }
}

export interface ExecutableNodeBase {
  execute(): Promise<ExecutionResult>
  estimatedCostBeforeExecution(): Promise<bigint>
}
