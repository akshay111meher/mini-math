import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { GrantCreditDeltaSchema, GrantOrRevokeRoleSchema } from '@mini-math/rbac'
import { StandardResponse, ValidationError } from './validate.js'

const RBAC = 'RBAC'

export const grantRole: RouteConfig = {
  method: 'post',
  path: '/grantRole',
  tags: [RBAC],
  summary: 'Grants Role to new users',
  request: {
    body: {
      content: {
        'application/json': { schema: GrantOrRevokeRoleSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When role is successfully granted',
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: {
      description: 'Validation Error',
      content: { 'application/json': { schema: ValidationError } },
    },
    401: {
      description: 'Unauthorized/Role-not-granted',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const grantCredits: RouteConfig = {
  method: 'post',
  path: '/grantCredits',
  tags: [RBAC],
  summary: 'Grants Credits to Users',
  request: {
    body: {
      content: {
        'application/json': { schema: GrantCreditDeltaSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When credit is successfully granted',
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
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const revokeRole: RouteConfig = {
  method: 'post',
  path: '/revokeRole',
  tags: [RBAC],
  summary: 'Revoke role of a users',
  request: {
    body: {
      content: {
        'application/json': { schema: GrantOrRevokeRoleSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When role is successfully revoked',
      content: { 'application/json': { schema: StandardResponse } },
    },
    400: {
      description: 'Validation Error',
      content: { 'application/json': { schema: ValidationError } },
    },
    401: {
      description: 'When role is not revoked',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}
