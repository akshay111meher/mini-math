import type { RequestHandler } from 'express'
import { GrantCreditDeltaSchemaType, getRoleAdmin, RoleStore, UserStore } from '@mini-math/rbac'
import { makeLogger } from '@mini-math/logger'

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

export function handleGrantCredits(userStore: UserStore): RequestHandler {
  return async (req, res) => {
    logger.trace(`User: ${req.user.address} trying to grant credits`)
    const payload = req.body as GrantCreditDeltaSchemaType
    const exists = await userStore.get(payload.userId)
    if (!exists) {
      const createResult = await userStore.create(
        payload.userId,
        payload.storageCredits,
        payload.executionCredits,
        payload.cdpAccountCredits,
      )
      if (createResult) {
        return res
          .status(200)
          .json({ success: true, message: 'user created + credits updated successfully' })
      }
    }

    const result = await userStore.adjustCredits(payload.userId, { ...payload })
    if (result) {
      return res.status(200).json({ success: true, message: 'credits updated successfully' })
    }
  }
}
