import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { WorkflowCore } from '@mini-math/workflow'
import { z } from 'zod'
import { StandardResponse } from './validate.js'

export const CRON = 'Cron Jobs'

export const IntervalScheduleSchema = z
  .object({
    type: z.literal('interval'),
    everyMs: z.number().int().positive(),
    maxRuns: z.number().int().positive().max(100),
    startAt: z.number().int().positive().optional(),
  })
  .refine((val) => val.startAt === undefined || val.startAt > Date.now(), {
    message: 'startAt must be a future timestamp (ms since epoch)',
    path: ['startAt'],
  })

export type IntervalScheduleType = z.infer<typeof IntervalScheduleSchema>

export const CronedWorkflowCoreSchema = z.object({
  workflowCore: WorkflowCore,
  intervalSchedule: IntervalScheduleSchema,
})

export type CronedWorkflowCoreType = z.infer<typeof CronedWorkflowCoreSchema>

export const cron: RouteConfig = {
  method: 'post',
  path: '/cron',
  tags: [CRON],
  summary: 'Load a job with cron like execution',
  request: {
    body: {
      content: {
        'application/json': { schema: CronedWorkflowCoreSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When Cron job is successfully loaded',
      content: { 'application/json': { schema: StandardResponse } },
    },
    404: {
      description: 'When Cron job is failed',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}
