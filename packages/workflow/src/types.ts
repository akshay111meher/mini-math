export type WorkflowId = string
export type NodeId = string
export type NodeType = string
export type PortId = string
export type RunId = string

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

export interface CostHint {
  base: number
  perItem?: number
  memory?: number // MB
  externalFeesUSD?: number // e.g., API costs
}

export interface DagNode {
  id: NodeId
  type: NodeType
  inputs: PortId[]
  outputs: PortId[]
  config?: Json
}

export interface Edge {
  from: { node: NodeId; port: PortId }
  to: { node: NodeId; port: PortId }
}

export interface Dag {
  id: WorkflowId
  name?: string
  nodes: DagNode[]
  edges: Edge[]
}

export interface ExecCtx {
  runId: RunId
  log(message: string): void
}

export interface NodeSpec<I = Json, O = Json> {
  type: NodeType // stable logical key (e.g., "js.eval.v1")
  deterministic: boolean // false => side-effecting activity
  plan(shape: I): CostHint // compile-time estimate only
  exec(input: I, ctx: ExecCtx): Promise<O> | O // runtime invocation (implementation elsewhere)
  inputSchema?: unknown // optional schema references (zod/io-ts later)
  outputSchema?: unknown
}

export interface NodeRegistry {
  get(type: NodeType): NodeSpec | undefined
  has(type: NodeType): boolean
  list(): NodeSpec[]
  register(spec: NodeSpec): void // registration only; no side effects here
}
