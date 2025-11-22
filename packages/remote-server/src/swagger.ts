import { z } from 'zod'
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { WorkflowSchema, WorkflowCore, ExpectingInputFor } from '@mini-math/workflow'
import { GrantOrRevokeRoleSchema } from '@mini-math/rbac'
import { BaseSecretSchema, SecretDataSchema, SecretIdenfiferSchema } from '@mini-math/secrets'
import { ExternalInputId, Input, NodeRef } from '@mini-math/nodes'

const REVOKED = "This is revoked. Don't use this now"
const ONLY_DEV = 'Only dev environment and for debugging. Do not integrate with UI'
const PROD_READY = 'Supported in production'
const AUTH = 'Authentication'
const RBAC = 'RBAC'
const SECRET = 'SECRET'
const INPUT = 'Send External Input to workflow'

export const StandardResponse = z
  .object({
    success: z.literal(false),
    message: z.string().optional(),
    error: z.any().optional(),
    data: z.any().optional(),
    issues: z.any().optional(),
  })
  .openapi('StandardResponse')

export const ID = z
  .object({
    id: z.string(),
  })
  .openapi('workflowId')

export const ExternalInputSchema = ID.extend({
  nodeId: NodeRef,
  externalInputId: ExternalInputId,
  data: Input,
})

export const ScheduleWorkflowPayload = ID.extend({
  initiateWorkflowInMs: z.number().positive().max(86400),
})

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
  security: [{ cookieAuth: [] }],
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
    400: {
      description: 'Bad Workflow',
      content: { 'application/json': { schema: StandardResponse } },
    },
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
    400: {
      description: 'Validation error',
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
})

registry.registerPath({
  method: 'post',
  path: '/clock',
  tags: [REVOKED],
  summary: 'Clock existing workflow clocked by one unit',
  request: {
    body: {
      content: {
        'application/json': { schema: ID },
      },
    },
  },
  responses: {},
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
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
  method: 'post',
  path: '/schedule',
  tags: [PROD_READY],
  summary: 'schedule the workflow in backend. (Does not return the output of any node tough)',
  request: {
    body: {
      content: {
        'application/json': { schema: ScheduleWorkflowPayload },
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
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
  method: 'post',
  path: '/fetch',
  tags: [PROD_READY],
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
  },
  security: [{ cookieAuth: [] }],
})

export const SiweNonceResponse = z.object({ nonce: z.string() }).openapi('SiweNonceResponse')

// GET /siwe/nonce
registry.registerPath({
  method: 'get',
  path: '/siwe/nonce',
  tags: [AUTH],
  summary: 'Get a single-use nonce for SIWE (Sign-In With Ethereum)',
  responses: {
    200: {
      description: 'Nonce issued',
      content: { 'application/json': { schema: SiweNonceResponse } },
    },
    429: {
      description: 'Rate limited',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
})

export const SiweVerifyBody = z
  .object({
    message: z.string().min(1),
    signature: z.string().min(1),
  })
  .openapi('SiweVerifyBody')

export const VerifyResponse = z
  .object({
    ok: z.literal(true),
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    chainId: z.number().int().positive(),
  })
  .openapi('VerifyResponse')

// POST /siwe/verify
registry.registerPath({
  method: 'post',
  path: '/siwe/verify',
  tags: [AUTH],
  summary: 'Verify SIWE message + signature; establish session (cookie)',
  request: {
    body: {
      content: {
        'application/json': { schema: SiweVerifyBody },
      },
    },
  },
  responses: {
    200: {
      description: 'Verification success; session created',
      content: { 'application/json': { schema: VerifyResponse } },
    },
    400: {
      description: 'Bad request / invalid SIWE message',
      content: { 'application/json': { schema: StandardResponse } },
    },
    401: {
      description: 'Signature invalid / nonce mismatch / expired',
      content: { 'application/json': { schema: StandardResponse } },
    },
    429: {
      description: 'Rate limited',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
})

// POST /logout
registry.registerPath({
  method: 'post',
  path: '/logout',
  tags: [AUTH],
  summary: 'Destroy current session',
  responses: {
    200: {
      description: 'Logged out',
      content: {
        'application/json': { schema: z.object({ ok: z.literal(true) }).openapi('LogoutResponse') },
      },
    },
  },
  security: [{ cookieAuth: [] }],
})

export const AuthUser = z
  .object({
    address: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .openapi({ example: '0x1234...abcd' }),
    chainId: z.number().int().positive().openapi({ example: 1 }),
    loggedInAt: z.string().datetime().openapi({ example: new Date().toISOString() }),
  })
  .openapi('AuthUser')

export const MeResponse = z
  .object({
    user: AuthUser.nullable(),
  })
  .openapi('MeResponse')

// GET /me
registry.registerPath({
  method: 'get',
  path: '/me',
  tags: [AUTH],
  summary: 'Current authenticated user (session)',
  responses: {
    200: {
      description: 'Returns current user or null if not logged in',
      content: { 'application/json': { schema: MeResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
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
    401: {
      description: 'When role is not granted',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
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
    401: {
      description: 'When role is not revoked',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
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
    429: {
      description: 'When max number of secrets are stored successfully',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
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
  },
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
  method: 'post',
  path: '/externalInput',
  tags: [INPUT],
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
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
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
      content: { 'application/json': { schema: SecretDataSchema } },
    },
    404: {
      description: 'When secret is not found',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
})

registry.registerPath({
  method: 'get',
  path: '/fetchAllSecretIdentifiers',
  tags: [SECRET],
  summary: 'Fetch all secret identifiers',
  responses: {
    200: {
      description: 'When secrets are successully found',
      content: { 'application/json': { schema: z.array(z.string()) } },
    },
    404: {
      description: 'When secrets identifiers are not found',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
})

const generator = new OpenApiGeneratorV3(registry.definitions)

export const openapiDoc = generator.generateDocument({
  openapi: '3.0.0',
  info: { title: 'API', version: '1.0.0' },
})
// ;(openapiDoc.components ??= {}).securitySchemes = {
//   ...(openapiDoc.components?.securitySchemes ?? {}),
//   cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sid' },
// }
