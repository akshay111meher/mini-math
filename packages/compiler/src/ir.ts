import { Json, PortId, NodeType, NodeId, WorkflowId, RunId } from '@mini-math/workflow'

export type ProgramId = string

export type Op =
  | { op: 'PUSH_CONST'; v: Json }
  | { op: 'LOAD_INPUTS'; ports: PortId[] }
  | { op: 'STORE_OUTPUTS'; ports: PortId[] }
  | { op: 'GET_VAR'; k: number }
  | { op: 'SET_VAR'; k: number }
  | { op: 'CALL_NODE'; nodeId: NodeId; nodeType: NodeType }
  | { op: 'CALL_ACTIVITY'; nodeId: NodeId; nodeType: NodeType }
  | { op: 'JOIN'; n: number }
  | { op: 'JMP'; ip: number }
  | { op: 'JMP_IF'; ip: number; flagVar: number }
  | { op: 'CHECKPOINT' }
  | { op: 'YIELD' }
  | { op: 'RAISE'; code: string; message?: string }
  | { op: 'END' }

export interface Program {
  programId: ProgramId
  workflowId: WorkflowId
  chunk: Op[]
  // optional: const pool, debug map, per-op cost hints
}

export interface Frame {
  runId: RunId
  program: Program
  ip: number // instruction pointer
  stack: Json[]
  locals: Json[]
  env?: Json // captured config/state
}
