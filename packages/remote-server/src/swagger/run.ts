import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { ONLY_DEV, StandardResponse } from './validate.js'
import { WorkflowCore, WorkflowSchema } from '@mini-math/workflow'

export const run: RouteConfig = {
  method: 'post',
  path: '/run',
  tags: [ONLY_DEV],
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
        'application/json': { schema: StandardResponse.extend({ data: WorkflowSchema }) },
      },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: StandardResponse } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
    403: {
      description: 'When user does not have sufficient priviledges / role',
      content: { 'application/json': { schema: StandardResponse } },
    },
    404: {
      description: 'Resources not found',
      content: { 'application/json': { schema: StandardResponse } },
    },
    409: {
      description: 'Workflow is already run',
      content: { 'application/json': { schema: StandardResponse } },
    },
    500: {
      description: 'Internal Server Error',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}
