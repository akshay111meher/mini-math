import type { RequestHandler } from 'express'
import { ImageStore } from '@mini-math/images'
import { StoreWorkflowImageSchemaType } from 'src/swagger/image.js'

export function handleUpdateImage(imageStore: ImageStore): RequestHandler {
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address

      const storeImagePayload = req.body as StoreWorkflowImageSchemaType

      // Check if workflowName already exists for this user
      const existingImage = await imageStore.get(userAddress, storeImagePayload.workflowName)
      if (existingImage) {
        const updated = await imageStore.update(
          userAddress,
          storeImagePayload.workflowName,
          storeImagePayload.core,
        )
        if (updated) {
          return res.status(201).json({
            success: true,
            message: 'workflow-image updated successfully',
            data: {
              owner: userAddress,
              workflowName: storeImagePayload.workflowName,
            },
          })
        } else {
          return res.status(400).json({
            success: false,
            message: 'workflow-image update failed',
          })
        }
      } else {
        return res.status(404).json({
          success: false,
          error: {
            code: 'VALIDATION',
            message: `WorkflowName: ${storeImagePayload.workflowName} not found`,
          },
        })
      }
    } catch (err) {
      // If you have a global error handler, pass it along
      return next(err)
    }
  }
}
