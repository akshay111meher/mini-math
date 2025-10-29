import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { EdgeDef, Input, NodeRef, NodeType, Output } from '@mini-math/nodes'
extendZodWithOpenApi(z)

const NodeDef = z.object({
  id: NodeRef,
  type: z.enum(NodeType),
  name: z.string(),
  config: z.unknown().default({}),
  data: z.unknown().optional(),
  inputs: z.array(Input).default([]),
  outputs: z.array(Output).default([]),
  executed: z.boolean().default(false),
  code: z.string().optional(),
})

export const MockWorkflowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.string(), // immutable once published
    nodes: z.array(NodeDef).min(1),
    edges: z.array(EdgeDef),
  })
  .openapi('MockWorkflow')
