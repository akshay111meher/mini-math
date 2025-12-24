import type { RequestHandler } from 'express'
import { BatchStore } from '@mini-math/workflow'
import { Logger } from '@mini-math/logger'
import { BatchSchemas } from '../../../schemas/index.js'

export function handleDelete(batchStore: BatchStore, logger: Logger): RequestHandler {
  return async (req, res) => {
    try {
      const userAddress = req.user.address
      const payload = req.body as BatchSchemas.ExistBatchRequest
      const result = await batchStore.delete(userAddress, payload.batchId)
      if (result) {
        return res.status(200).json({ status: true, message: 'batch deleted successfullt' })
      }

      return res.status(404).json({ status: false, data: 'batch not found' })
    } catch (ex) {
      logger.error(`${String(ex)}`)

      return res
        .status(400)
        .json({ status: false, data: String(ex), message: 'Failed fetching batch jobs' })
    }
  }
}
