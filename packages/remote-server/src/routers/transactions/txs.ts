import { RequestHandler, Router } from 'express'
import { requireAuth, validateBody } from '../../middlewares/index.js'
import { UserTransactionStore } from '@mini-math/rbac'
import { TransactionSearchSchema, TransactionSearchType } from './swagger.js'

export { doc, basePath } from './swagger.js'

export function create(transactionStore: UserTransactionStore): Router {
  const router = Router()

  router.post(
    '/fetchTransactions',
    requireAuth(),
    validateBody(TransactionSearchSchema),
    handleTransactionQuery(transactionStore),
  )
  return router
}

function handleTransactionQuery(transactionStore: UserTransactionStore): RequestHandler {
  return async (req, res) => {
    const userId = req.user.address
    const payload = req.body as TransactionSearchType

    const result = await transactionStore.list(
      { ...payload.search, userId },
      { ...payload.options },
    )

    return res.status(200).json({
      success: true,
      message: 'Success',
      result,
    })
  }
}
