import { Router } from 'express'
import { requireAuth, validateBody } from '../middlewares/index.js'
import { ensureMaxSecretsCount } from 'src/middlewares/secret.js'
import { BaseSecretSchema, SecretIdenfiferSchema, SecretStore } from '@mini-math/secrets'
import {
  handleFetchAllSecretIdentifiers,
  handleFetchSecret,
  handleRemoveSecret,
  handleStoreSecret,
} from 'src/secret.js'
export function create(secretStore: SecretStore): Router {
  const router = Router()

  router.post(
    '/storeSecret',
    requireAuth(),
    validateBody(BaseSecretSchema),
    ensureMaxSecretsCount(secretStore),
    handleStoreSecret(secretStore),
  )

  router.post(
    '/removeSecret',
    requireAuth(),
    validateBody(SecretIdenfiferSchema),
    handleRemoveSecret(secretStore),
  )

  router.post(
    '/fetchSecret',
    requireAuth(),
    validateBody(SecretIdenfiferSchema),
    handleFetchSecret(secretStore),
  )

  router.get(
    '/fetchAllSecretIdentifiers',
    requireAuth(),
    handleFetchAllSecretIdentifiers(secretStore),
  )

  return router
}
