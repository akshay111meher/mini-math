import { Router, Request, Response } from 'express'
import { Logger, makeLogger } from '@mini-math/logger'

// Map chain ID to network name (for response compatibility)
const chainIdToNetwork: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  84532: 'base-sepolia',
  137: 'polygon',
  56: 'bsc',
  42161: 'arbitrum',
  10: 'optimism',
  43114: 'avalanche',
}

const ONE_INCH_BASE_URL = 'https://api.1inch.dev'

export { basePath, doc } from './swagger.js'

/**
 * GET /tokens/:chainId
 * Get supported tokens from 1inch for a specific chain
 * Migrated from old backend: backend/src/routes/web3.ts
 */
export function create(logger: Logger = makeLogger('token-router')): Router {
  const router = Router()

  router.get('/tokens/:chainId', async (req: Request, res: Response) => {
    try {
      const chainIdParam = req.params.chainId
      const chainId = parseInt(chainIdParam, 10)

      if (isNaN(chainId)) {
        logger.debug(`Invallid chainId: ${chainIdParam}`)
        return res.status(400).json({
          success: false,
          error: `Invalid chain ID: ${chainIdParam}`,
        })
      }

      const network = chainIdToNetwork[chainId]
      if (!network) {
        logger.debug(`Network for chainId: ${chainIdParam} is not defined`)
        return res.status(400).json({
          success: false,
          error: `Unsupported chain ID: ${chainId}`,
        })
      }

      // Get 1inch API key from environment
      const apiKey = process.env.ONE_INCH_KEY
      if (!apiKey) {
        logger.error('ONE_INCH_KEY is not set in environment')
        return res.status(500).json({
          success: false,
          error: '1inch API key not configured',
        })
      }

      logger.info('Fetching supported tokens from 1inch', { chainId, network })

      // Call 1inch API directly
      const response = await fetch(`${ONE_INCH_BASE_URL}/token/v1.2/${chainId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Failed to fetch tokens from 1inch', {
          chainId,
          status: response.status,
          error: errorText,
        })
        return res.status(response.status).json({
          success: false,
          error: `Failed to fetch tokens from 1inch: ${response.statusText}`,
        })
      }

      const tokenList = await response.json()

      type OneInchToken = {
        symbol: string
        name: string
        decimals: number
        logoURI?: string
      }

      const tokenListRecord = tokenList as Record<string, OneInchToken>

      const transformedTokens = Object.entries(tokenListRecord).map(([address, tokenData]) => ({
        address,
        symbol: tokenData.symbol,
        name: tokenData.name,
        decimals: tokenData.decimals,
        icon: tokenData.logoURI ?? null,
      }))

      logger.info('Successfully fetched tokens', {
        chainId,
        network,
        tokenCount: transformedTokens.length,
      })

      return res.json({
        success: true,
        data: {
          chainId,
          network,
          tokens: transformedTokens,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Failed to fetch supported tokens', { error: errorMessage })
      return res.status(500).json({
        success: false,
        error: errorMessage,
      })
    }
  })

  return router
}
