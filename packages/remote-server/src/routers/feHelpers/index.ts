import { Router } from 'express'
import { handleAbiRequest, handleGasRequest } from './routes/index.js'
import { Logger } from '@mini-math/logger'
import { requireAuth } from '../../middlewares/auth.js'

export { doc, basePath } from './swagger.js'

export function create(etherscanApikey: string, logger: Logger): Router {
  const router = Router()

  const rpcUrls: string[] = [
    'https://polygon.drpc.org',
    'https://base.llamarpc.com',
    'https://eth.llamarpc.com',
    'https://arb1.arbitrum.io/rpc',
    'https://mainnet.optimism.io',
  ]
  router.get('/gasPrices', handleGasRequest(rpcUrls, logger))
  router.post('/abi', requireAuth(), handleAbiRequest(etherscanApikey))
  return router
}
