import { RequestHandler, Router } from 'express'
import { requireAuth, validateBody } from '../../middlewares/index.js'
import { ImageStore } from '@mini-math/images'
import { UserStore } from '@mini-math/rbac'

import {
  handleCountImages,
  handleDeleteImage,
  handleImageExists,
  handleListImages,
  handleStoreImage,
  handleUpdateImage,
} from './routes/index.js'
import { COST, ListOptionsSchema } from '@mini-math/utils'
import { ImageSchemas } from '../../schemas/index.js'

export { doc } from './swagger.js'

export function create(
  mustHaveMinimumStorageCredits: (minCredits: number) => RequestHandler,
  imageStore: ImageStore,
  userStore: UserStore,
): Router {
  const router = Router()

  router.post(
    '/storeImage',
    requireAuth(),
    mustHaveMinimumStorageCredits(1),
    validateBody(ImageSchemas.StoreWorkflowImageSchema),
    handleStoreImage(imageStore, userStore, COST.IMAGE_STORAGE_COST_IN_CREDITS),
  )

  router.post(
    '/existImage',
    requireAuth(),
    validateBody(ImageSchemas.WorkflowNameSchema),
    handleImageExists(imageStore),
  )

  router.post(
    '/deleteImage',
    requireAuth(),
    validateBody(ImageSchemas.WorkflowNameSchema),
    handleDeleteImage(imageStore),
  )

  router.post(
    '/listImages',
    requireAuth(),
    validateBody(ListOptionsSchema),
    handleListImages(imageStore),
  )

  router.get('/countImages', requireAuth(), handleCountImages(imageStore))

  router.post(
    '/updateImage',
    requireAuth(),
    validateBody(ImageSchemas.StoreWorkflowImageSchema),
    handleUpdateImage(imageStore),
  )

  return router
}
