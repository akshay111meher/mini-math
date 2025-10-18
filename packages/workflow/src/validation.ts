import { Dag, NodeId, NodeRegistry } from './types.js'

export type ValidationLevel = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  level: ValidationLevel
  code: string // e.g., DAG_CYCLE, NODE_UNKNOWN, PORT_MISSING
  message: string
  nodeId?: NodeId
}

export interface ValidationReport {
  ok: boolean
  issues: ValidationIssue[]
}

export interface Validator {
  validate(dag: Dag, registry: NodeRegistry): ValidationReport // do not throw; report issues
}
