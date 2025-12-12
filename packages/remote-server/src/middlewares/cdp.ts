import { UserStore } from '@mini-math/rbac'
import type { RequestHandler } from 'express'

import { makeLogger } from '@mini-math/logger'
const logger = makeLogger('cdp-middlwares')

export const revertIfNoMinimumCdpCredits =
  (userStore: UserStore) =>
  (minCredits: number): RequestHandler => {
    return async (req, res, next) => {
      const user = req.user

      if (!user) {
        logger.trace('No user on request')
        return res.status(401).json({ success: false, message: 'user not found' })
      }

      try {
        const userData = await userStore.get(user.address)

        if (!userData) {
          return res
            .status(404)
            .json({ success: false, message: `User: ${user.address} not found` })
        }

        if (userData.cdpAccountCredits && userData.cdpAccountCredits >= minCredits) {
          return next()
        }
        return res
          .status(403)
          .json({ success: false, message: `must have minumum: ${minCredits} cdpAccount credits` })
      } catch (err) {
        logger.error(`Error while fetching user ${user}: ${(err as Error).message}`)
        return res.status(500).json({ success: false, message: 'internal server error' })
      }
    }
  }
