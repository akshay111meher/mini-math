import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { BaseSecretSchema, SecretDataSchema, SecretIdenfiferSchema } from '@mini-math/secrets'
import { StandardResponse, ValidationError } from './validate.js'
import z from 'zod'

const SECRET = 'SECRET'

export const storeSecret: RouteConfig = {
  method: 'post',
  path: '/storeSecret',
  tags: [SECRET],
  summary: 'Stores secrets for user',
  request: {
    body: {
      content: {
        'application/json': { schema: BaseSecretSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When secret is successfully stored',
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: {
      description: 'Validation Error',
      content: { 'application/json': { schema: ValidationError } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
    429: {
      description: 'When max number of secrets are stored successfully',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const removeSecret: RouteConfig = {
  method: 'post',
  path: '/removeSecret',
  tags: [SECRET],
  summary: 'Remove an existing stored secret',
  request: {
    body: {
      content: {
        'application/json': { schema: SecretIdenfiferSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'When secret is successfully removed',
      content: { 'application/json': { schema: StandardResponse } },
    },
    200: {
      description: 'When secret is not removed',
      content: { 'application/json': { schema: StandardResponse } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: {
      description: 'Validation Error',
      content: { 'application/json': { schema: ValidationError } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const fetchSecret: RouteConfig = {
  method: 'post',
  path: '/fetchSecret',
  tags: [SECRET],
  summary: 'Fetch A single secret with known identifier',
  request: {
    body: {
      content: {
        'application/json': { schema: SecretIdenfiferSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When secret is successfully removed',
      content: {
        'application/json': { schema: StandardResponse.extend({ data: SecretDataSchema }) },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: {
      description: 'Validation Error',
      content: { 'application/json': { schema: ValidationError } },
    },
    404: {
      description: 'When secret is not found',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const fetchAllSecretIdentifiers: RouteConfig = {
  method: 'get',
  path: '/fetchAllSecretIdentifiers',
  tags: [SECRET],
  summary: 'Fetch all secret identifiers',
  responses: {
    200: {
      description: 'When secrets are successully found',
      content: {
        'application/json': { schema: StandardResponse.extend({ data: z.array(z.string()) }) },
      },
    },
    404: {
      description: 'When secrets identifiers are not found',
      content: { 'application/json': { schema: StandardResponse } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}
