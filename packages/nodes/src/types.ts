import { z } from 'zod'

export const NodeRef = z.string().min(16)
export const EdgeRef = z.string().min(16)

export enum NodeType {
  'http.request',
  'map',
  'code',
}

export const Input = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
})

export const Output = z.object({ id: z.string().optional(), name: z.string(), type: z.string() })

export const NodeDef = z.object({
  id: NodeRef,
  type: z.enum(NodeType),
  name: z.string(),
  config: z.json().default({}),
  data: z.json().optional(),
  inputs: z.array(z.object(Input)).default([]),
  outputs: z.array(z.object(Output)).default([]),
  executed: z.boolean().default(false),
  code: z.string().optional(),
})

export type NodeDefType = z.infer<typeof NodeDef>

export const EdgeDef = z.object({
  id: EdgeRef,
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(), // expression string
})

export type EdgeDefType = z.infer<typeof EdgeDef>

export interface ExecutableNode {
  execute(): Promise<ExecutableNode>
}

export interface NodeFactoryType {
  make(node: NodeDefType): ExecutableNode
}
