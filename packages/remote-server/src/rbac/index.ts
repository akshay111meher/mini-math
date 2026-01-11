import type { RequestHandler } from 'express'
import { GrantCreditDeltaSchemaType, getRoleAdmin, RoleStore, UserStore } from '@mini-math/rbac'
import { makeLogger } from '@mini-math/logger'
import { v4 as uuidv4 } from 'uuid'

const logger = makeLogger('Rbac Handlers')

export function handleGrantRole(roleStore: RoleStore): RequestHandler {
  return async (req, res) => {
    logger.trace(`User: ${req.user.address} trying to grant ${req.body.role} to ${req.body.user}`)
    const callerRoles = await roleStore.getRoles(req.user.address)
    logger.trace(`Roles available with ${req.user.address}: ${JSON.stringify(callerRoles)}`)
    const grantingRole = req.body.role
    const roleAdmin = getRoleAdmin(grantingRole)
    logger.trace(`${roleAdmin} is on top of role: ${grantingRole}`)

    if (roleAdmin && callerRoles.includes(roleAdmin)) {
      await roleStore.addRoleBySchema(req.body)

      return res.status(200).json({
        success: true,
        message: `User: ${req.user.address} granted ${req.body.role} to ${req.body.user}`,
      })
    } else {
      return res.status(401).json({
        success: false,
        message: `User: ${req.user.address} is not allowed to grant ${req.body.role} to ${req.body.user}`,
      })
    }
  }
}

export function handleRevokeRole(roleStore: RoleStore): RequestHandler {
  return async (req, res) => {
    logger.trace(
      `User: ${req.user.address} trying to revoke ${req.body.role} from ${req.body.user}`,
    )
    const callerRoles = await roleStore.getRoles(req.user.address)
    logger.trace(`Roles available with ${req.user.address}: ${JSON.stringify(callerRoles)}`)

    const revokingRole = req.body.role
    const roleAdmin = getRoleAdmin(revokingRole)
    logger.trace(`${roleAdmin} is on top of role: ${revokingRole}`)

    if (roleAdmin && callerRoles.includes(roleAdmin)) {
      await roleStore.removeRoleBySchema(req.body)
      return res.status(200).json({
        success: true,
        message: `User: ${req.user.address} revoked ${req.body.role} to ${req.body.user}`,
      })
    } else {
      return res.status(401).json({
        success: false,
        message: `User: ${req.user.address} is not allowed to revoke ${req.body.role} from ${req.body.user}`,
      })
    }
  }
}

export function handleIncreaseCredits(userStore: UserStore): RequestHandler {
  return async (req, res) => {
    logger.trace(`User: ${req.user.address} trying to grant credits`)
    const payload = req.body as GrantCreditDeltaSchemaType
    const exists = await userStore.get(payload.userId)
    if (!exists) {
      await userStore.create(payload.userId, {}, { kind: 'admin_adjustment', memo: uuidv4() })
    }

    const result = await userStore.increaseCredits(
      payload.userId,
      'platform',
      { ...payload },
      {
        kind: 'admin_adjustment',
        refId: uuidv4(),
        memo: 'granted credit via admin',
      },
    )
    if (result) {
      return res.status(200).json({ success: true, message: 'credits updated successfully' })
    }
  }
}

export function handleDecreaseCredits(userStore: UserStore): RequestHandler {
  return async (req, res) => {
    logger.trace(`User: ${req.user.address} trying to revoke credits`)
    const payload = req.body as GrantCreditDeltaSchemaType
    const exists = await userStore.get(payload.userId)
    if (!exists) {
      await userStore.create(payload.userId, {}, { kind: 'admin_adjustment', memo: uuidv4() })
    }

    const result = await userStore.reduceCredits(
      payload.userId,
      { ...payload },
      { kind: 'admin_adjustment', refId: uuidv4() },
    )
    if (result) {
      return res.status(200).json({ success: true, message: 'credits updated successfully' })
    }
  }
}
