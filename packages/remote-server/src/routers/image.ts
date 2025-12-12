import { RequestHandler, Router } from 'express'
import { requireAuth, validateBody } from '../middlewares/index.js'
import { StoreWorkflowImageSchema } from '../swagger/index.js'
import { ImageStore } from '@mini-math/images'
import { UserStore } from '@mini-math/rbac'
import { WorkflowNameSchema } from '../swagger/image.js'
import {
  handleCountImages,
  handleDeleteImage,
  handleImageExists,
  handleListImages,
  handleStoreImage,
  handleUpdateImage,
} from '../image/index.js'
import { ListOptionsSchema } from '@mini-math/utils'
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
    validateBody(StoreWorkflowImageSchema),
    handleStoreImage(imageStore, userStore),
  )

  router.post(
    '/existImage',
    requireAuth(),
    validateBody(WorkflowNameSchema),
    handleImageExists(imageStore),
  )

  router.post(
    '/deleteImage',
    requireAuth(),
    validateBody(WorkflowNameSchema),
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
    validateBody(StoreWorkflowImageSchema),
    handleUpdateImage(imageStore),
  )

  return router
}
