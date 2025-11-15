import { z } from 'zod'
import { NodeDef, NodeDefType, EdgeDef, ExecutionResult, NodeRef } from '@mini-math/nodes'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

export const WorkflowRef = z.string().min(16)
export type WorkflowRefType = z.infer<typeof WorkflowRef>

export const WorkflowCore = z
  .object({
    name: z.string().max(255, 'Name must be at most 255 characters').optional(),
    version: z.string().min(1).max(2),
    nodes: z.array(NodeDef).min(1),
    edges: z.array(EdgeDef),
    entry: NodeRef,
    globalState: z.unknown().optional(),
  })
  .openapi('WorkflowCore')

export type WorkflowCoreType = z.infer<typeof WorkflowCore>
const WorkflowOwnerRef = z.string()

export const WorkflowSchema = WorkflowCore.extend({ id: WorkflowRef })
  .extend({ owner: WorkflowOwnerRef })
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

export interface ClockTerminated {
  status: 'terminated'
  node: NodeDefType
  exec: ExecutionResult
}

export type ClockResult = ClockOk | ClockFinished | ClockError | ClockTerminated
