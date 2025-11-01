import { z } from 'zod'
import { NodeDef, NodeDefType, EdgeDef, ExecutionResult } from '@mini-math/nodes'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

export const WorkflowRef = z.string().min(16)

export const WorkflowSchema = z
  .object({
    id: WorkflowRef,
    name: z.string().optional(),
    version: z.string(),
    nodes: z.array(NodeDef).min(1),
    edges: z.array(EdgeDef),
    entry: z.string(), // start node
  })
  .openapi('Workflow')

export type WorkflowDef = z.infer<typeof WorkflowSchema>

export interface ClockOk {
  status: 'ok'
  node: NodeDefType
  exec: ExecutionResult
}

export interface ClockFinished {
  status: 'finished'
}

export interface ClockError {
  status: 'error'
  code: string
}

export type ClockResult = ClockOk | ClockFinished | ClockError
