import type { RequestHandler } from 'express'
import { ImageStore } from '@mini-math/images'
import { WorkflowNameSchemaType } from 'src/swagger/image.js'

export function handleDeleteImage(imageStore: ImageStore): RequestHandler {
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address

      const { workflowName } = req.body as WorkflowNameSchemaType
      const deleted = await imageStore.delete(userAddress, workflowName)

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DELETE_FAILED',
            message: `Workflow image '${workflowName}' not deleted for this user (ignore if no such image-name exists)`,
          },
        })
      }

      return res.status(202).json({
        success: true,
        message: 'workflow-image deleted successfully',
        data: workflowName,
      })
    } catch (err) {
      return next(err)
    }
  }
}
