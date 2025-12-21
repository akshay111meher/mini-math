import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { ListOptionsSchema, makeListResultSchema } from '@mini-math/utils'
import { CdpAccountNameSchema } from '@mini-math/secrets'
import { CommonSchemas, CDP, CdpSchemas } from '../../schemas/index.js'
import z from 'zod'

export const basePath = '/cdp'

const createAccount: RouteConfig = {
  method: 'post',
  path: `${basePath}/account`,
  tags: [CDP],
  summary: 'Create CDP account',
  description:
    'Creates a new CDP account or returns the existing account if it already exists for the requested name/parameters. Requires an authenticated session.',
  request: {
    body: {
      content: {
        'application/json': { schema: CdpSchemas.CreateAccountSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Account created or retrieved successfully',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({
            data: CdpSchemas.AccountResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

const getAccount: RouteConfig = {
  method: 'get',
  path: `${basePath}/account/{accountName}`,
  tags: [CDP],
  summary: 'Get CDP account',
  description:
    'Fetches details for a CDP account by its account name. Requires an authenticated session.',
  request: {
    params: z.object({
      accountName: z.string().describe('Name of the account'),
    }),
  },
  responses: {
    200: {
      description: 'Account retrieved successfully',
      content: { 'application/json': { schema: CdpSchemas.AccountCheckResponseSchema } },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

const getTokenBalances: RouteConfig = {
  method: 'get',
  path: `${basePath}/token-balances`,
  tags: [CDP],
  summary: 'Get token balances',
  description:
    'Returns token balances for a given address on the configured chain(s), based on the provided query parameters. Requires an authenticated session.',
  request: {
    query: CdpSchemas.TokenBalancesQuerySchema,
  },
  responses: {
    200: {
      description: 'Token balances retrieved successfully',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({
            data: CdpSchemas.TokenBalancesResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

const requestFaucet: RouteConfig = {
  method: 'post',
  path: `${basePath}/faucet`,
  tags: [CDP],
  summary: 'Request faucet tokens',
  description:
    'Requests testnet faucet tokens for an address/account according to the faucet request payload. Requires an authenticated session.',
  request: {
    body: {
      content: {
        'application/json': { schema: CdpSchemas.FaucetRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Faucet request successful',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({
            data: CdpSchemas.FaucetResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

const exportAccount: RouteConfig = {
  method: 'post',
  path: `${basePath}/export-account`,
  tags: [CDP],
  summary: 'Export private key',
  description:
    'Exports the private key for a CDP account (for backup or external use). Handle the response securely. Requires an authenticated session.',
  request: {
    body: {
      content: {
        'application/json': { schema: CdpSchemas.ExportAccountSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Account exported successfully',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({
            data: CdpSchemas.ExportAccountResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

const fetchAccountNames: RouteConfig = {
  method: 'post',
  path: `${basePath}/fetchAccountNames`,
  tags: [CDP],
  summary: 'List account names',
  description:
    'Lists available CDP account names for the authenticated user, with cursor-based pagination via the provided list options.',
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
            data: makeListResultSchema(CdpAccountNameSchema),
          }),
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const doc: RouteConfig[] = [
  createAccount,
  getAccount,
  getTokenBalances,
  fetchAccountNames,
  exportAccount,
  requestFaucet,
]
