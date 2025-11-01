import { z } from 'zod'
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { WorkflowSchema } from '@mini-math/workflow'

const registry = new OpenAPIRegistry()

const ValidateResponseSchema = z.object({
  isValid: z.boolean(),
})

registry.registerPath({
  method: 'post',
  path: '/validate',
  summary: 'Validate Workflow Schema',
  request: {
    body: {
      content: {
        'application/json': { schema: WorkflowSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Workflow is valid',
      content: { 'application/json': { schema: ValidateResponseSchema } },
    },
    400: { description: 'Validation error' },
  },
})

registry.registerPath({
  method: 'post',
  path: '/compile',
  summary: 'Compile the workflow',
  request: {
    body: {
      content: {
        'application/json': { schema: WorkflowSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Compiles the workflow',
      content: { 'application/json': { schema: WorkflowSchema } },
    },
    400: { description: 'Bad Workflow' },
  },
})

registry.registerPath({
  method: 'post',
  path: '/run',
  summary: 'Run the workflow',
  request: {
    body: {
      content: {
        'application/json': { schema: WorkflowSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Workflow is valid',
      content: { 'application/json': { schema: WorkflowSchema } },
    },
    400: { description: 'Validation error' },
  },
})

const generator = new OpenApiGeneratorV3(registry.definitions)

export const openapiDoc = generator.generateDocument({
  openapi: '3.0.0',
  info: { title: 'API', version: '1.0.0' },
  servers: [{ url: process.env.SERVER_URL ?? 'http://localhost:3000' }],
})
