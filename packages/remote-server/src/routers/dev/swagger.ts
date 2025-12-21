import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { WorkflowCore, WorkflowSchema } from '@mini-math/workflow'
import { CommonSchemas, ONLY_DEV } from '../../schemas/index.js'

export const REVOKED = 'Revoked'

export const clock: RouteConfig = {
  method: 'post',
  path: '/clock',
  tags: [REVOKED],
  deprecated: true,
  summary: 'Clock existing workflow clocked by one unit',
  request: {
    body: {
      content: {
        'application/json': { schema: CommonSchemas.ID },
      },
    },
  },
  responses: {},
}

export const run: RouteConfig = {
  method: 'post',
  path: '/run',
  tags: [ONLY_DEV],
  deprecated: true,
  summary:
    'Run the workflow and wait for the workflow output in the same http response. Not to be used in the production',
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
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({ data: WorkflowSchema }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    403: {
      description: 'When user does not have sufficient priviledges / role',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    404: {
      description: 'Resources not found',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    409: {
      description: 'Workflow is already run',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    500: {
      description: 'Internal Server Error',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const doc: RouteConfig[] = [clock, run]
