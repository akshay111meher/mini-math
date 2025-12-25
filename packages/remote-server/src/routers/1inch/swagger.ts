import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import z from 'zod'

const ONE_INCH = '1INCH'
export const basePath = '/tokens'
const GetSupportedTokensDoc: RouteConfig = {
  method: 'get',
  path: `${basePath}/:chainId`,
  tags: [ONE_INCH],
  summary: 'Get supported tokens from 1inch for a specific chain',
  description:
    'Fetches the supported token list from 1inch for the given chainId and returns it in the legacy mini-math format.',
  request: {
    params: z.object({
      chainId: z
        .string()
        .regex(/^\d+$/, 'chainId must be a numeric string')
        .describe('EVM chain id (e.g., 1, 8453, 137, 56, 42161, 10, 43114)'),
    }),
  },
  responses: {
    200: {
      description: 'Token list',
      content: {
        'application/json': {
          schema: z
            .object({
              success: z.literal(true),
              data: z.object({
                chainId: z.number().int(),
                network: z.string(),
                tokens: z.array(
                  z.object({
                    address: z.string(),
                    symbol: z.string(),
                    name: z.string(),
                    decimals: z.number().int(),
                    icon: z.string().nullable(),
                  }),
                ),
              }),
            })
            .strict(),
        },
      },
    },

    400: {
      description: 'Invalid or unsupported chainId',
      content: {
        'application/json': {
          schema: z
            .object({
              success: z.literal(false),
              error: z.string(),
            })
            .strict(),
        },
      },
    },

    401: {
      description: 'Unauthorized from upstream (invalid/missing 1inch API key)',
      content: {
        'application/json': {
          schema: z
            .object({
              success: z.literal(false),
              error: z.string(),
            })
            .strict(),
        },
      },
    },

    429: {
      description: 'Rate-limited by upstream (1inch)',
      content: {
        'application/json': {
          schema: z
            .object({
              success: z.literal(false),
              error: z.string(),
            })
            .strict(),
        },
      },
    },

    500: {
      description: 'Server error / missing ONE_INCH_KEY / unexpected failure',
      content: {
        'application/json': {
          schema: z
            .object({
              success: z.literal(false),
              error: z.string(),
            })
            .strict(),
        },
      },
    },
  },
} as const

export const doc: RouteConfig[] = [GetSupportedTokensDoc]
