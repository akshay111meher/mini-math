import { WorkflowCore } from '@mini-math/workflow'
import z from 'zod'

export const ScheduleBatchRequestSchema = z.object({
  workflowCore: WorkflowCore,
  schedulesInMs: z.array(z.number().min(10).max(10000000)).min(2).max(100),
})

export type ScheduleBatchRequest = z.infer<typeof ScheduleBatchRequestSchema>

export const ExistBatchRequestSchema = z.object({ batchId: z.string() })
export type ExistBatchRequest = z.infer<typeof ExistBatchRequestSchema>

export const BatchCreateResponseDataSchema = z.object({
  batchId: z.string(),
  workflowIds: z.array(z.string()),
})
