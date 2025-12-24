import type { RequestHandler } from 'express'
import { BatchStore } from '@mini-math/workflow'
import { Logger } from '@mini-math/logger'
import { BatchSchemas } from '../../../schemas/index.js'
import { ListOptions } from '@mini-math/utils'

export function handleGet(batchStore: BatchStore, logger: Logger): RequestHandler {
  return async (req, res) => {
    try {
      const userAddress = req.user.address
      const payload = req.body as BatchSchemas.ExistBatchRequest
      const result = await batchStore.get(userAddress, payload.batchId)
      if (result) {
        return res.status(200).json({ status: true, data: { workflowIds: result } })
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

export function handleListBatches(batchStore: BatchStore): RequestHandler {
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address
      const options = req.body as ListOptions
      const result = await batchStore.list(userAddress, options)

      return res.status(200).json({
        success: true,
        data: {
          items: result.items,
          nextCursor: result.nextCursor,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
}
