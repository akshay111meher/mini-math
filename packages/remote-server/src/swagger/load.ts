import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { ID, StandardResponse, ValidationError } from './validate.js'
import { ExpectingInputFor, WorkflowCore, WorkflowSchema } from '@mini-math/workflow'
import z from 'zod'
import { ExternalInputId, Input, NodeRef } from '@mini-math/nodes'

export const EXECUTION = 'Requires Execution Credits'
export const WORKFLOW = ' Workflow'

export const load: RouteConfig = {
  method: 'post',
  path: '/load',
  tags: [EXECUTION],
  summary: 'Load Workflow Schema into engine',
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
      content: { 'application/json': { schema: ID } },
    },
    400: {
      description: 'Validator Error',
      content: { 'application/json': { schema: ValidationError } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const fetch: RouteConfig = {
  method: 'post',
  path: '/fetch',
  tags: [WORKFLOW],
  summary: 'Fetch the state of workflow',
  request: {
    body: {
      content: {
        'application/json': { schema: ID },
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
            status: z.enum(['inProgress', 'initiated', 'awaitingInput', 'idle']),
            expectingInputFor: ExpectingInputFor.optional(),
          }),
        },
      },
    },
    400: {
      description: 'Validator Error',
      content: { 'application/json': { schema: ValidationError } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const ExternalInputSchema = ID.extend({
  nodeId: NodeRef,
  externalInputId: ExternalInputId,
  data: Input,
})

export const externalInput: RouteConfig = {
  method: 'post',
  path: '/externalInput',
  tags: [WORKFLOW],
  summary: 'Send External Input to Workflow',
  request: {
    body: {
      content: {
        'application/json': { schema: ExternalInputSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When external input is successfully accepted',
      content: { 'application/json': { schema: StandardResponse.extend({ data: WorkflowCore }) } },
    },
    400: {
      description: 'Validator Error / Wrong Input Expected',
      content: { 'application/json': { schema: ValidationError } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
    409: {
      description: 'Workflow Finished',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}
