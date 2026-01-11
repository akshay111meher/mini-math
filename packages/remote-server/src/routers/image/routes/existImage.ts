import type { RequestHandler } from 'express'
import { ImageStore } from '@mini-math/images'
import { ImageSchemas } from '../../../schemas/index.js'

export function handleImageExists(imageStore: ImageStore): RequestHandler {
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address

      const { imageId } = req.body as ImageSchemas.WorkflowNameSchemaType

      const exists = await imageStore.exists(userAddress, imageId)

      return res.status(200).json({
        success: true,
        data: {
          exists,
          owner: userAddress,
          imageId,
        },
      })
    } catch (err) {
      return next(err)
    }
  }
}
