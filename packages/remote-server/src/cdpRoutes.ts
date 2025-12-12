import { Router } from 'express'
import { requireAuth } from './middlewares/index.js'
import { cdpService, parseNetwork } from './cdp.js'

export function createCdpRoutes(): Router {
  const router = Router()

  router.post('/account', requireAuth(), async (req, res, next) => {
    try {
      const { accountName } = req.body as { accountName?: string }
      if (!accountName)
        return res.status(400).json({ success: false, error: 'accountName is required' })
      const account = await cdpService.createOrGetAccount(accountName)
      res.json({ success: true, data: account })
    } catch (err) {
      next(err)
    }
  })

  router.get('/account/:accountName', requireAuth(), async (req, res, next) => {
    try {
      const { accountName } = req.params
      const account = await cdpService.getAccount(accountName)
      res.json({ success: true, data: account, exists: !!account })
    } catch (err) {
      next(err)
    }
  })

  router.get('/token-balances', requireAuth(), async (req, res, next) => {
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
      res.json({ success: true, data: balances })
    } catch (err) {
      next(err)
    }
  })

  router.post('/faucet', requireAuth(), async (req, res, next) => {
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
      res.json({ success: true, data: faucet })
    } catch (err) {
      next(err)
    }
  })

  router.post('/export-account', requireAuth(), async (req, res, next) => {
    try {
      const { accountName, address } = req.body as { accountName?: string; address?: string }
      if (!accountName && !address)
        return res.status(400).json({ success: false, error: 'accountName or address is required' })
      const result = await cdpService.exportAccount({ accountName, address })
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  })

  return router
}
