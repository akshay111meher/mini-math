import { Router, RequestHandler } from 'express'
import { requireAuth } from '../../middlewares/auth.js'
import { cdpService, parseNetwork } from './cdp.js'
import { keccak256, toUtf8Bytes, concat } from 'ethers'
import { CdpAccountStore } from '@mini-math/secrets'
import { ListOptions } from '@mini-math/utils'
import { UserStore } from '@mini-math/rbac'

export function accountNameIdentifier(authenticatonAddress: string, accountName: string): string {
  authenticatonAddress = authenticatonAddress.toLowerCase()
  const hAuth = keccak256(toUtf8Bytes(authenticatonAddress.trim().toLowerCase()))
  const hName = keccak256(toUtf8Bytes(accountName.trim()))

  return keccak256(concat([hAuth, hName]))
}

export function create(
  cdpAccountStore: CdpAccountStore,
  userStore: UserStore,
  mustHaveMinCdpAccountCredits: (minCredits: number) => RequestHandler,
): Router {
  const router = Router()

  router.use(requireAuth())
  router.post('/account', mustHaveMinCdpAccountCredits(1), async (req, res, next) => {
    try {
      const { accountName } = req.body as { accountName?: string }
      if (!accountName)
        return res.status(400).json({ success: false, error: 'accountName is required' })

      const exists = await cdpAccountStore.exists(req.user.address, accountName)

      const account = await cdpService.createOrGetAccount(
        accountNameIdentifier(req.user.address, accountName),
      )

      if (!exists) {
        // then deduct credits for creation
        await userStore.adjustCredits(req.user.address, { cdpAccountCredits: -1 })
      }

      await cdpAccountStore.store(req.user.address, accountName)
      return res.json({ success: true, data: account })
    } catch (err) {
      next(err)
    }
  })

  router.get('/account/:accountName', async (req, res, next) => {
    try {
      const { accountName } = req.params
      const exists = cdpAccountStore.exists(req.user.address, accountName)
      if (!exists) {
        return res.json({ success: true, data: null, exists: false })
      }
      const account = await cdpService.getAccount(
        accountNameIdentifier(req.user.address, accountName),
      )
      return res.json({ success: true, data: account, exists: !!account })
    } catch (err) {
      next(err)
    }
  })

  router.get('/token-balances', async (req, res, next) => {
    try {
      const { address, network, pageSize, pageToken } = req.query
      if (!address || !network)
        return res.status(400).json({ success: false, error: 'address and network are required' })
      const balances = await cdpService.listTokenBalances(
        address as string,
        parseNetwork(network),
        pageSize ? Number(pageSize) : undefined,
        pageToken as string | undefined,
      )
      return res.json({ success: true, data: balances })
    } catch (err) {
      next(err)
    }
  })

  router.post('/faucet', async (req, res, next) => {
    try {
      const {
        address,
        network = 'base-sepolia',
        token = 'eth',
      } = req.body as {
        address?: string
        network?: string
        token?: string
      }
      if (!address) return res.status(400).json({ success: false, error: 'address is required' })
      const faucet = await cdpService.requestFaucet(address, network, token)
      return res.json({ success: true, data: faucet })
    } catch (err) {
      next(err)
    }
  })

  router.post('/export-account', async (req, res, next) => {
    try {
      const { accountName } = req.body as { accountName: string }
      if (!accountName)
        return res.status(400).json({ success: false, error: 'accountName is required' })
      const result = await cdpService.exportAccount({
        accountName: accountNameIdentifier(req.user.address, accountName),
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
