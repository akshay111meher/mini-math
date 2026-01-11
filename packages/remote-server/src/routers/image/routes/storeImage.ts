import type { RequestHandler } from 'express'
import { ImageStore } from '@mini-math/images'
import { UserStore } from '@mini-math/rbac'
import { ImageSchemas } from '../../../schemas/index.js'
import { v4 as uuidv4 } from 'uuid'

export function handleStoreImage(
  imageStore: ImageStore,
  userStore: UserStore,
  storageCreditCost: number,
): RequestHandler {
  // ensure it is positive
  storageCreditCost = Math.abs(storageCreditCost)
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address

      const storeImagePayload = req.body as ImageSchemas.StoreWorkflowImageSchemaType

      // Check if workflowName already exists for this user
      const existingImage = await imageStore.get(userAddress, storeImagePayload.imageId)
      if (existingImage) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'VALIDATION',
            message: `WorkflowName: ${storeImagePayload.workflowName} already exists`,
          },
        })
      }

      const created = await imageStore.create(
        userAddress,
        storeImagePayload.imageId,
        storeImagePayload.core,
        storeImagePayload.workflowName,
      )

      // If ImageStore uses a boolean return to signal "already existed" (race condition)
      if (!created) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: `WorkflowName: ${storeImagePayload.workflowName} already exists`,
          },
        })
      }

      const creditsUpdated = await userStore.reduceCredits(
        userAddress,
        {
          unifiedCredits: storageCreditCost,
        },
        {
          kind: 'other',
          refId: uuidv4(),
          meta: { for: 'storing image', image: storeImagePayload.workflowName },
        },
      )

      return res.status(201).json({
        success: true,
        message: 'workflow-image saved successfully',
        data: {
          owner: userAddress,
          workflowName: storeImagePayload.workflowName,
          storageCreditsRemaining: creditsUpdated.unifiedCredits,
        },
      })
    } catch (err) {
      // If you have a global error handler, pass it along
      return next(err)
    }
  }
}
