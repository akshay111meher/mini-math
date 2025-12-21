import type { RequestHandler } from 'express'

import type { ListOptions } from '@mini-math/utils'
import { WorkflowStore } from '@mini-math/workflow'

export function handleListWorkflows(workflowStore: WorkflowStore): RequestHandler {
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address
      const options = req.body as ListOptions
      const result = await workflowStore.list(userAddress, options)

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
