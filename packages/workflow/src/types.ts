import { z } from 'zod'
import { NodeDef, NodeDefType, EdgeDef, ExecutionResult } from '@mini-math/nodes'
import { RuntimeStateSchema } from '@mini-math/runtime'
import { WORKFLOW_CONSTANTS } from '@mini-math/utils'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

export const WorkflowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.string(), // immutable once published
    nodes: z.array(NodeDef).min(1),
    edges: z.array(EdgeDef),
    entry: z.string(), // start node
    // global execution policies: May be used latter
    policies: z
      .object({
        defaultTimeoutMs: z.number().int().min(1).default(WORKFLOW_CONSTANTS.DEFAULT_TIMEOUT_MS),
        maxParallel: z.number().int().min(1).default(WORKFLOW_CONSTANTS.MAX_PARALLEL),
      })
      .default({
        defaultTimeoutMs: WORKFLOW_CONSTANTS.DEFAULT_TIMEOUT_MS,
        maxParallel: WORKFLOW_CONSTANTS.MAX_PARALLEL,
      }),

    runtime: RuntimeStateSchema.default({
      queue: [],
      visited: [],
      current: null,
      finished: false,
    }),
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
