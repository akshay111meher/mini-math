import { makeLogger } from '@mini-math/logger'
import { Role, RoleStore } from '@mini-math/rbac'
import type { RequestHandler } from 'express'
import { SessionUser } from 'src/auth.js'

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
        logger.warn('No user on request')
        return res.status(401).json({ success: false, message: 'user not found' })
      }

      try {
        const allRoles = await roleStore.getRoles(user.address)

        for (let index = 0; index < roles.length; index++) {
          const role = allRoles[index]
          if (allRoles.includes(role)) {
            return next()
          }
        }
        logger.info(`User ${user} has no role ${allRoles}, reverting`)
        return res.status(403).json({ success: false, message: 'forbidden for role' })

        return next()
      } catch (err) {
        logger.error(`Error while fetching roles for user ${user}: ${(err as Error).message}`)
        return res.status(500).json({ success: false, message: 'internal server error' })
      }
    }
  }
