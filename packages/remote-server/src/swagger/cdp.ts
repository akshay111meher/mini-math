import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { StandardResponse } from './validate.js'

const CDP = 'CDP'

export const CreateAccountSchema = z.object({
  accountName: z.string().describe('Name of the account to create or get'),
})

export const AccountResponseSchema = z
  .object({
    name: z.string(),
    address: z.string(),
    createdAt: z.string(),
  })
  .openapi('CdpAccount')

export const AccountCheckResponseSchema = z
  .object({
    success: z.boolean(),
    data: AccountResponseSchema.nullable(),
    exists: z.boolean(),
  })
  .openapi('AccountCheckResponse')

export const TokenBalancesQuerySchema = z.object({
  address: z.string().describe('Wallet address'),
  network: z.string().describe('Network name (e.g., base-sepolia)'),
  pageSize: z.number().optional().describe('Number of results per page'),
  pageToken: z.string().optional().describe('Token for pagination'),
})

export const TokenBalanceSchema = z
  .object({
    token: z.object({
      network: z.string(),
      symbol: z.string(),
      name: z.string(),
      contractAddress: z.string(),
    }),
    amount: z.object({
      amount: z.string(),
      decimals: z.number(),
    }),
  })
  .openapi('TokenBalance')

export const TokenBalancesResponseSchema = z
  .object({
    balances: z.array(TokenBalanceSchema),
    nextPageToken: z.string().optional(),
  })
  .openapi('TokenBalancesResponse')

export const FaucetRequestSchema = z.object({
  address: z.string().describe('Wallet address to fund'),
  network: z.string().default('base-sepolia').describe('Network name'),
  token: z.string().default('eth').describe('Token symbol'),
})

export const FaucetResponseSchema = z
  .object({
    transactionHash: z.string(),
    network: z.string(),
    token: z.string(),
    address: z.string(),
  })
  .openapi('FaucetResponse')

export const ExportAccountSchema = z.object({
  accountName: z.string().optional().describe('Account name'),
  address: z.string().optional().describe('Account address'),
})

export const ExportAccountResponseSchema = z
  .object({
    privateKey: z.string(),
  })
  .openapi('ExportAccountResponse')

export const createAccount: RouteConfig = {
  method: 'post',
  path: '/cdp/account',
  tags: [CDP],
  summary: 'Create or get a CDP account',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateAccountSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Account created or retrieved successfully',
      content: {
        'application/json': {
          schema: StandardResponse.extend({
            data: AccountResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const getAccount: RouteConfig = {
  method: 'get',
  path: '/cdp/account/{accountName}',
  tags: [CDP],
  summary: 'Get a CDP account by name',
  request: {
    params: z.object({
      accountName: z.string().describe('Name of the account'),
    }),
  },
  responses: {
    200: {
      description: 'Account retrieved successfully',
      content: { 'application/json': { schema: AccountCheckResponseSchema } },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const getTokenBalances: RouteConfig = {
  method: 'get',
  path: '/cdp/token-balances',
  tags: [CDP],
  summary: 'Get token balances for an address',
  request: {
    query: TokenBalancesQuerySchema,
  },
  responses: {
    200: {
      description: 'Token balances retrieved successfully',
      content: {
        'application/json': {
          schema: StandardResponse.extend({
            data: TokenBalancesResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const requestFaucet: RouteConfig = {
  method: 'post',
  path: '/cdp/faucet',
  tags: [CDP],
  summary: 'Request faucet tokens',
  request: {
    body: {
      content: {
        'application/json': { schema: FaucetRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Faucet request successful',
      content: {
        'application/json': {
          schema: StandardResponse.extend({
            data: FaucetResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const exportAccount: RouteConfig = {
  method: 'post',
  path: '/cdp/export-account',
  tags: [CDP],
  summary: 'Export account private key',
  request: {
    body: {
      content: {
        'application/json': { schema: ExportAccountSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Account exported successfully',
      content: {
        'application/json': {
          schema: StandardResponse.extend({
            data: ExportAccountResponseSchema,
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: { 'application/json': { schema: StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}
