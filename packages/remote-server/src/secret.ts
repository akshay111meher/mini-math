import { BaseSecretSchema, SecretIdenfiferSchema, SecretStore } from '@mini-math/secrets'
import { RequestHandler } from 'express'

export function handleStoreSecret(secretStore: SecretStore): RequestHandler {
  return async (req, res) => {
    const userId = req.user.address
    const baseSecret = BaseSecretSchema.parse(req.body)
    await secretStore.saveSecret({ userId, ...baseSecret })

    return res.status(200).json({
      success: true,
      message: 'Stored secret successfully',
    })
  }
}

export function handleRemoveSecret(secretStore: SecretStore): RequestHandler {
  return async (req, res) => {
    const userId = req.user.address
    const body = SecretIdenfiferSchema.parse(req.body)
    const result = await secretStore.deleteSecret(userId, body.secretIdentifier)

    if (result) {
      return res.status(201).json({
        success: true,
        message: 'remove secret successfully',
      })
    } else {
      return res.status(200).json({
        success: false,
        message: 'secret not removed',
      })
    }
  }
}

export function handleFetchSecret(secretStore: SecretStore): RequestHandler {
  return async (req, res) => {
    const userId = req.user.address
    const body = SecretIdenfiferSchema.parse(req.body)
    const result = await secretStore.getSecret(userId, body.secretIdentifier)

    if (result) {
      return res.status(200).json({ status: true, data: result })
    } else {
      return res.status(404).json({
        success: false,
        message: 'secret not found',
      })
    }
  }
}

export function handleFetchAllSecretIdentifiers(secretStore: SecretStore): RequestHandler {
  return async (req, res) => {
    const userId = req.user.address
    const result = await secretStore.listSecrets(userId)
    if (result.length == 0) {
      return res.status(404).json({
        success: false,
        message: 'secret not found',
      })
    } else {
      return res.status(200).json({ status: true, data: result.map((a) => a.secretIdentifier) })
    }
  }
}
