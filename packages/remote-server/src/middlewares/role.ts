import { Role, RoleStore } from '@mini-math/rbac'
import type { RequestHandler } from 'express'
import { SessionUser } from '../routers/auth/auth.js'
import { getAddress } from 'viem'

import { makeLogger } from '@mini-math/logger'
const logger = makeLogger('role-middlwares')

declare module 'express-serve-static-core' {
  interface Request {
    user: SessionUser
  }
}

export const revertIfNoRole =
  (roleStore: RoleStore) =>
  (roles: Role[]): RequestHandler => {
    return async (req, res, next) => {
      const user = req.user

      if (!user) {
        logger.trace('No user on request')
        return res.status(401).json({ success: false, message: 'user not found' })
      }

      try {
        const normalizedAddress = getAddress(user.address)
        const allRoles = await roleStore.getRoles(normalizedAddress)

        for (const requiredRole of roles) {
          if (allRoles.includes(requiredRole)) {
            logger.trace(`User ${normalizedAddress} has required role ${requiredRole}`)
            return next()
          }
        }
        logger.info(
          `User ${normalizedAddress} has roles [${allRoles.join(', ')}] but needs one of [${roles.join(', ')}], reverting`,
        )
        return res.status(403).json({ success: false, message: 'forbidden for role' })
      } catch (err) {
        logger.error(`Error while fetching roles for user ${user}: ${(err as Error).message}`)
        return res.status(500).json({ success: false, message: 'internal server error' })
      }
    }
  }
