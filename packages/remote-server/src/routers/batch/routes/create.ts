import type { RequestHandler } from 'express'
import { BatchStore, WorkflowCoreType, WorkflowRefType } from '@mini-math/workflow'
import { Logger } from '@mini-math/logger'
import { BatchSchemas } from '../../../schemas/index.js'
import { v4 as uuidv4 } from 'uuid'
import { IQueue } from '@mini-math/queue'
import { allLimit } from '@mini-math/utils'

export function handleExists(batchStore: BatchStore, logger: Logger): RequestHandler {
  return async (req, res) => {
    try {
      const userAddress = req.user.address
      const payload = req.body as BatchSchemas.ExistBatchRequest
      const result = await batchStore.exists(userAddress, payload.batchId)
      if (result) {
        return res.status(200).json({ status: true, data: 'job exists in db' })
      }

      return res.status(404).json({ status: false, data: 'job not found' })
    } catch (ex) {
      logger.error(`${String(ex)}`)

      return res
        .status(400)
        .json({ status: false, data: String(ex), message: 'Failed fetching batch jobs' })
    }
  }
}

export function handleCreate(
  batchStore: BatchStore,
  queue: IQueue<WorkflowRefType>,
  logger: Logger,
): RequestHandler {
  return async (req, res) => {
    try {
      const userAddress = req.user.address
      const payload = req.body as BatchSchemas.ScheduleBatchRequest

      const creations: WorkflowCoreType[] = []
      for (let index = 0; index < payload.schedulesInMs.length; index++) {
        creations.push(payload.workflowCore)
      }

      const batchId = uuidv4()
      const result = await batchStore.create(userAddress, batchId, creations)
      if (result.length != 0) {
        const allCalls = result.map((a, i) => () => queue.enqueue(a, payload.schedulesInMs[i] || 0))
        const enqueueResult = await allLimit(allCalls, 5)

        logger.trace(JSON.stringify(enqueueResult))
        return res.status(200).json({ status: true, data: { batchId, workflowIds: result } })
      }

      return res.status(400).json({ status: false, message: 'failed creating batch jobs' })
    } catch (ex) {
      logger.error(`${String(ex)}`)

      return res
        .status(400)
        .json({ status: false, data: String(ex), message: 'Failed creating batch jobs' })
    }
  }
}
