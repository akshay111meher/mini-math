import { z } from 'zod'
import { NodeDef, NodeDefType, EdgeDef, ExecutionResult } from '@mini-math/nodes'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

export const WorkflowRef = z.string().min(16)

export const WorkflowCore = z
  .object({
    name: z.string().optional(),
    version: z.string(),
    nodes: z.array(NodeDef).min(1),
    edges: z.array(EdgeDef),
    entry: z.string(),
    globalState: z.unknown().optional(),
  })
  .openapi('WorkflowCore')

export type WorkflowCoreDef = z.infer<typeof WorkflowCore>
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
