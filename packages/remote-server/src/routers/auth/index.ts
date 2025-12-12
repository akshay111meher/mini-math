import { Router } from 'express'
import { logout, verifySiwe } from './auth.js'
import { getNonce, requireAuth } from '../../middlewares/auth.js'
import { UserStore } from '@mini-math/rbac'

export function create(userStore: UserStore, siweDomain: string): Router {
  const router = Router()

  router.get('/siwe/nonce', getNonce())
  router.post('/siwe/verify', verifySiwe(siweDomain))

  router.post('/logout', requireAuth(), logout())

  router.get('/me', requireAuth(), async (req, res) => {
    if (req?.session?.user) {
      const userData = await userStore.get(req.session.user.address)
      return res.json({ user: req.session.user, userData })
    } else {
      return res.status(404).json({ user: null })
    }
  })

  return router
}
