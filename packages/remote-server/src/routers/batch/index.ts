import { BatchStore, WorkflowRefType } from '@mini-math/workflow'
import { Router } from 'express'
import { requireAuth, validateBody } from '../../middlewares/index.js'
import { BatchSchemas } from 'src/schemas/index.js'
import { handleCreate, handleExists } from './routes/create.js'
import { Logger } from '@mini-math/logger'
import { IQueue } from '@mini-math/queue'
import { handleGet, handleListBatches } from './routes/get.js'
import { handleDelete } from './routes/delete.js'
import { ListOptionsSchema } from '@mini-math/utils'

export { basePath, doc } from './swagger.js'

export function create(
  batchStore: BatchStore,
  queue: IQueue<WorkflowRefType>,
  logger: Logger,
): Router {
  const router = Router()
  router.post(
    '/createBatch',
    requireAuth(),
    validateBody(BatchSchemas.ScheduleBatchRequestSchema),
    handleCreate(batchStore, queue, logger),
  )

  router.post(
    '/existsBatch',
    requireAuth(),
    validateBody(BatchSchemas.ExistBatchRequestSchema),
    handleExists(batchStore, logger),
  )

  router.post(
    '/getBatch',
    requireAuth(),
    validateBody(BatchSchemas.ExistBatchRequestSchema),
    handleGet(batchStore, logger),
  )

  router.post(
    '/deleteBatch',
    requireAuth(),
    validateBody(BatchSchemas.ExistBatchRequestSchema),
    handleDelete(batchStore, logger),
  )

  router.post(
    '/listBatches',
    requireAuth(),
    validateBody(ListOptionsSchema),
    handleListBatches(batchStore),
  )

  return router
}
