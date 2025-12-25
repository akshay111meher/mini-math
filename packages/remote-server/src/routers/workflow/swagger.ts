import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { ExpectingInputFor, WorkflowCore, WorkflowSchema } from '@mini-math/workflow'
import { CommonSchemas, CRON, VALIDATE, WORKFLOW } from '../../schemas/index.js'
import z from 'zod'
import { ListOptionsSchema, makeListResultSchema } from '@mini-math/utils'

export const validate: RouteConfig = {
  method: 'post',
  tags: [VALIDATE],
  path: '/validate',
  summary: 'Validate workflow',
  description:
    'Validates the submitted workflow schema and returns validation errors (if any). This endpoint only checks correctness and does not execute the workflow or consume credits.',
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
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
  },
}

export const compile: RouteConfig = {
  method: 'post',
  path: '/compile',
  tags: [VALIDATE],
  summary: 'Compile workflow',
  description:
    'Compiles the submitted workflow into an executable form and returns compilation results. This does not run the workflow and does not consume credits.',
  request: {
    body: {
      content: {
        'application/json': { schema: WorkflowCore },
      },
    },
  },
  responses: {
    200: {
      description: 'Compiles the workflow',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    400: {
      description: 'Bad Workflow',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
  },
}

export const cron: RouteConfig = {
  method: 'post',
  path: '/cron',
  tags: [CRON],
  summary: 'Create cron job',
  description:
    'Registers a workflow to run on a cron-like schedule. The workflow is validated and stored, then scheduled for execution according to the provided cron settings.',
  request: {
    body: {
      content: {
        'application/json': { schema: CommonSchemas.CronedWorkflowCoreSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When Cron job is successfully loaded',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    400: {
      description: 'Validation Error',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
    404: {
      description: 'When Cron job is failed',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const initiate: RouteConfig = {
  method: 'post',
  path: '/initiate',
  tags: [WORKFLOW],
  summary: 'Initiate workflow',
  description:
    'Starts execution of an already-loaded workflow by workflow ID. This kicks off the run in the backend and returns an initiation status (it does not return node outputs).',
  request: {
    body: {
      content: {
        'application/json': { schema: CommonSchemas.ID },
      },
    },
  },
  responses: {
    200: {
      description: 'Returns result of workflow initiation',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    400: {
      description: 'Validation Error / If workflow is linked with previous workflow',
      content: {
        'application/json': {
          schema: CommonSchemas.ValidationError.or(CommonSchemas.StandardResponse),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({ status: z.literal(false) }),
        },
      },
    },
    409: {
      description: 'Workflow is already initialized/finished',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({ status: z.literal(false) }),
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const schedule: RouteConfig = {
  method: 'post',
  path: '/schedule',
  tags: [WORKFLOW],
  summary: 'Schedule workflow',
  description:
    'Schedules an already-loaded workflow for execution using the provided schedule settings. This creates a backend schedule entry and returns a status (it does not return node outputs).',
  request: {
    body: {
      content: {
        'application/json': { schema: CommonSchemas.ScheduleWorkflowPayload },
      },
    },
  },
  responses: {
    200: {
      description: 'Returns result of workflow initiation',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    400: {
      description: 'Validation Error / prev linked to some other workflow',
      content: {
        'application/json': {
          schema: CommonSchemas.ValidationError.or(CommonSchemas.StandardResponse),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({ status: z.literal(false) }),
        },
      },
    },
    409: {
      description: 'Already in Progress ? Finished',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({ status: z.literal(false) }),
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const load: RouteConfig = {
  method: 'post',
  path: '/load',
  tags: [WORKFLOW],
  summary: 'Load workflow',
  description:
    'Validates and stores a workflow schema in the execution engine, returning a workflow ID that can be used to initiate, schedule, or fetch its state later.',
  request: {
    body: {
      content: {
        'application/json': { schema: WorkflowCore },
      },
    },
  },
  responses: {
    201: {
      description: 'If the workflow is valid, it will return workflow ID.',
      content: { 'application/json': { schema: CommonSchemas.ID } },
    },
    400: {
      description: 'Validator Error',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const fetch: RouteConfig = {
  method: 'post',
  path: '/fetch',
  tags: [WORKFLOW],
  summary: 'Fetch workflow state',
  description:
    'Returns the latest state of a workflow run by workflow ID. If the workflow is finished, the final result is returned; otherwise, the current status and any pending input requirements are returned.',
  request: {
    body: {
      content: {
        'application/json': { schema: CommonSchemas.ID },
      },
    },
  },
  responses: {
    200: {
      description: 'Returns workflow status when finished',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string().describe('Value will be `finished`'),
            result: WorkflowSchema,
          }),
        },
      },
    },
    206: {
      description: 'Returns result of partial workflow',
      content: {
        'application/json': {
          schema: z.object({
            status: z.enum(['inProgress', 'initiated', 'awaitingInput', 'idle', 'terminated']),
            expectingInputFor: ExpectingInputFor.optional(),
            result: WorkflowCore.optional(),
          }),
        },
      },
    },
    400: {
      description: 'Validator Error',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const externalInput: RouteConfig = {
  method: 'post',
  path: '/externalInput',
  tags: [WORKFLOW],
  summary: 'Send external input',
  description:
    'Submits external input to a workflow that is waiting for input. The backend validates the input against what the workflow expects and applies it to continue execution.',
  request: {
    body: {
      content: {
        'application/json': { schema: CommonSchemas.ExternalInputSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When external input is successfully accepted',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({ data: WorkflowCore }),
        },
      },
    },
    400: {
      description: 'Validator Error / Wrong Input Expected',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    409: {
      description: 'Workflow Finished',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const listWorkflows: RouteConfig = {
  method: 'post',
  path: '/listWorkflows',
  tags: [WORKFLOW],
  summary: 'List workflows',
  description:
    'Lists workflows visible to the authenticated user. Supports cursor-based pagination via the provided list options.',
  request: {
    body: {
      content: {
        'application/json': { schema: ListOptionsSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Status of the image',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({
            data: makeListResultSchema(WorkflowSchema),
          }),
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const doc: RouteConfig[] = [
  compile,
  cron,
  validate,
  schedule,
  initiate,
  load,
  externalInput,
  fetch,
  listWorkflows,
]
