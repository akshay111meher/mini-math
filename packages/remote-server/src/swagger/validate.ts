import { WorkflowCore } from '@mini-math/workflow'
import { z } from 'zod'
import type { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { ZodIssueCode } from 'zod/v3'

export const IssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.enum(ZodIssueCode),
})
export type IssueSchemaType = z.infer<typeof IssueSchema>

export const VALIDATE = 'Validate'
export const ONLY_DEV = 'Only Developer Role'

export const StandardResponse = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
    error: z.any().optional(),
    data: z.any().optional(),
    issues: z.any().optional(),
  })
  .openapi('StandardResponse')

export const ValidationError = z.object({
  status: z.literal(false),
  error: z.literal('ValidationError'),
  issues: IssueSchema,
})

export const ID = z
  .object({
    id: z.string(),
  })
  .openapi('workflowId')

export const validate: RouteConfig = {
  method: 'post',
  tags: [VALIDATE],
  path: '/validate',
  summary: 'Validate Workflow Schema',
  request: {
    body: {
      content: {
        'application/json': { schema: WorkflowCore },
      },
    },
  },
  responses: {
    200: {
      description: 'Workflow is valid',
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ValidationError } },
    },
  },
}
