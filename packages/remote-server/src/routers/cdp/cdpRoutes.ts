import { Router, RequestHandler } from 'express'
import { requireAuth } from '../../middlewares/auth.js'
import { cdpService, parseNetwork } from './cdp.js'
import { createHash } from 'crypto'
import { CdpAccountStore } from '@mini-math/secrets'
import { ListOptions } from '@mini-math/utils'
import { UserStore } from '@mini-math/rbac'

export function accountNameV1(address: string): string {
  const normalized = address.trim().toLowerCase()
  const digest = createHash('sha256').update(normalized).digest('hex')
  const base = digest.slice(0, 24)
  return `${base}00`
}

export { doc, basePath } from './swagger.js'

export function create(
  cdpAccountStore: CdpAccountStore,
  userStore: UserStore,
  mustHaveMinCdpAccountCredits: (minCredits: number) => RequestHandler,
): Router {
  const router = Router()

  router.use(requireAuth())
  router.post('/account', mustHaveMinCdpAccountCredits(1), async (req, res, next) => {
    try {
      const userAddress = req.user.address
      const derivedAccountName = userAddress

      const exists = await cdpAccountStore.exists(userAddress, derivedAccountName)

      const accountName = accountNameV1(userAddress)
      const account = await cdpService.createOrGetAccount(accountName)

      if (!exists) {
        // then deduct credits for creation
        await userStore.adjustCredits(userAddress, { cdpAccountCredits: -1 })
      }

      await cdpAccountStore.store(userAddress, derivedAccountName)
      return res.json({ success: true, data: account })
    } catch (err) {
      next(err)
    }
  })

  router.get('/account', async (req, res, next) => {
    try {
      const userAddress = req.user.address
      const derivedAccountName = userAddress
      const accountName = accountNameV1(userAddress)
      const account = await cdpService.getAccount(accountName)
      const exists = !!account

      // If Coinbase has an account but our local store does not, backfill it.
      if (exists) {
        const localExists = await cdpAccountStore.exists(userAddress, derivedAccountName)
        if (!localExists) {
          await cdpAccountStore.store(userAddress, derivedAccountName)
        }
      }

      return res.json({ success: true, data: account, exists })
    } catch (err) {
      next(err)
    }
  })

  router.get('/token-balances', async (req, res, next) => {
    try {
      const { network, pageSize, pageToken } = req.query
      if (!network) return res.status(400).json({ success: false, error: 'network is required' })

      const userAddress = req.user.address
      const derivedAccountName = userAddress

      try {
        const accountName = accountNameV1(derivedAccountName)
        const account = await cdpService.getAccount(accountName)
        if (!account) {
          return res
            .status(404)
            .json({ success: false, error: 'CDP account not found for this user' })
        }

        const parsedNetwork = parseNetwork(network)

        const balances = await cdpService.listTokenBalances(
          account.address,
          parsedNetwork,
          pageSize ? Number(pageSize) : undefined,
          pageToken as string | undefined,
        )
        return res.json({ success: true, data: balances })
      } catch (err) {
        const message = (err as Error).message || 'failed to fetch token balances'
        return res.status(400).json({ success: false, error: message })
      }
    } catch (err) {
      next(err)
    }
  })

  router.post('/faucet', async (req, res, next) => {
    try {
      const { network = 'base-sepolia', token = 'eth' } = req.body as {
        network?: string
        token?: string
      }

      const userAddress = req.user.address
      const derivedAccountName = userAddress

      const accountName = accountNameV1(derivedAccountName)
      const account = await cdpService.getAccount(accountName)
      if (!account) {
        return res
          .status(404)
          .json({ success: false, error: 'CDP account not found for this user' })
      }

      const faucet = await cdpService.requestFaucet(account.address, network, token)
      return res.json({ success: true, data: faucet })
    } catch (err) {
      next(err)
    }
  })

  router.post('/export-account', async (req, res, next) => {
    try {
      const userAddress = req.user.address
      const derivedAccountName = userAddress
      const accountName = accountNameV1(derivedAccountName)
      const result = await cdpService.exportAccount({
        accountName,
      })
      return res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  })

  router.post('/fetchAccountNames', async (req, res, next) => {
    try {
      const userId = req.user.address
      const options = req.body as ListOptions

      const result = await cdpAccountStore.listByUser(userId, options)
      if (result.items.length == 0) {
        return res.status(404).json({
          success: false,
          message: 'not found',
        })
      } else {
        return res.status(200).json({ status: true, data: result })
      }
    } catch (error) {
      next(error)
    }
  })

  return router
}
