import { WorkflowCore } from '@mini-math/workflow'

import z from 'zod'
export const WorkflowNameSchema = z.object({
  workflowName: z.string().max(225).optional(),
  imageId: z.string().max(255),
})
export type WorkflowNameSchemaType = z.infer<typeof WorkflowNameSchema>

export const StoreWorkflowImageSchema = WorkflowNameSchema.extend({ core: WorkflowCore })
export type StoreWorkflowImageSchemaType = z.infer<typeof StoreWorkflowImageSchema>
