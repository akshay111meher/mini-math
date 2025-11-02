import { z } from 'zod'
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { WorkflowSchema, WorkflowCore } from '@mini-math/workflow'

const ONLY_DEV = 'Only dev environment and for debugging. Do not integrate with UI'
const PROD_READY = 'Supported in production'

export const StandardResponse = z
  .object({
    success: z.literal(false),
    message: z.string().optional(),
    error: z.string().optional(),
    data: z.any().optional(),
  })
  .openapi('StandardResponse')

export const ID = z
  .object({
    id: z.string(),
  })
  .openapi('ID')

const registry = new OpenAPIRegistry()

registry.registerPath({
  method: 'post',
  tags: [PROD_READY],
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
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/load',
  tags: [PROD_READY],
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
      description: 'error',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/compile',
  tags: [PROD_READY],
  summary: 'Compile the workflow',
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
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: { description: 'Bad Workflow' },
  },
})

registry.registerPath({
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
      content: { 'application/json': { schema: WorkflowSchema } },
    },
    400: { description: 'Validation error' },
    409: {
      description: 'Workflow is already run',
      content: { 'application/json': { schema: StandardResponse } },
    },
    501: {
      description: 'Internal Server Error',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/clock',
  tags: [ONLY_DEV],
  summary: 'Clock existing workflow clocked by one unit',
  request: {
    body: {
      content: {
        'application/json': { schema: ID },
      },
    },
  },
  responses: {
    200: {
      description: 'Return workflow clocked by one unit',
      content: { 'application/json': { schema: WorkflowSchema } },
    },
    400: {
      description: 'error',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/initiate',
  tags: [PROD_READY],
  summary: 'Initiate the workflow in backend. (Does not return the output of any node tough)',
  request: {
    body: {
      content: {
        'application/json': { schema: ID },
      },
    },
  },
  responses: {
    200: {
      description: 'Returns result of workflow initiation',
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: {
      description: 'error',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
})

const generator = new OpenApiGeneratorV3(registry.definitions)

export const openapiDoc = generator.generateDocument({
  openapi: '3.0.0',
  info: { title: 'API', version: '1.0.0' },
  servers: [{ url: process.env.SERVER_URL ?? 'http://localhost:3000' }],
})
