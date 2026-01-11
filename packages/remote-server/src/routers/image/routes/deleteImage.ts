import type { RequestHandler } from 'express'
import { ImageStore } from '@mini-math/images'
import { ImageSchemas } from '../../../schemas/index.js'

export function handleDeleteImage(imageStore: ImageStore): RequestHandler {
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address

      const { imageId } = req.body as ImageSchemas.WorkflowNameSchemaType
      const deleted = await imageStore.delete(userAddress, imageId)

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DELETE_FAILED',
            message: `Workflow imageId '${imageId}' not deleted for this user (ignore if no such image-name exists)`,
          },
        })
      }

      return res.status(202).json({
        success: true,
        message: 'workflow-image deleted successfully',
        data: imageId,
      })
    } catch (err) {
      return next(err)
    }
  }
}
