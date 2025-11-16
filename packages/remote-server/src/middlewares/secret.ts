import { SecretStore, BaseSecretType } from '@mini-math/secrets'
import { RequestHandler } from 'express'

const MAX_NUMBER_OF_SECRETS = 50

export function ensureMaxSecretsCount(secretStore: SecretStore): RequestHandler {
  return async (req, res, next) => {
    const userId = req.user.address
    const secrets = await secretStore.listSecrets(userId)
    if (secrets.length >= MAX_NUMBER_OF_SECRETS) {
      return res.status(420).json({
        success: false,
        message: `User: ${req.user.address} can't store more than ${MAX_NUMBER_OF_SECRETS}. Delete some secrets`,
      })
    }
    return next()
  }
}
