import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { TransactionListOptionsSchema, TxFilterSchema, UserTxRecordSchema } from '@mini-math/rbac'
import { StandardResponse } from 'src/schemas/common.js'
import { CommonSchemas } from '../../schemas/index.js'
import z from 'zod'

export const TransactionSearchSchema = z.object({
  search: TxFilterSchema.omit({ userId: true }).optional(),
  options: TransactionListOptionsSchema.optional(),
})
export type TransactionSearchType = z.infer<typeof TransactionSearchSchema>

export const TransactionsSearchResponse = StandardResponse.extend({ result: UserTxRecordSchema })

const Transactions = 'Transactions'
export const basePath = '/transactions'

export const fetchTransactions: RouteConfig = {
  method: 'post',
  path: `${basePath}/fetchTransactions`,
  tags: [Transactions],
  summary: 'Fetch user transactions',
  request: {
    body: {
      content: {
        'application/json': { schema: TransactionSearchSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'When transactions are found',
      content: {
        'application/json': {
          schema: TransactionsSearchResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    400: {
      description: 'Validation Error',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const doc: RouteConfig[] = [fetchTransactions]
