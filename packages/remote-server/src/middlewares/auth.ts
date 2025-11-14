import { Request, Response, NextFunction } from 'express'
import { randomBytes } from 'crypto'
import 'express-session'
import { makeLogger } from '@mini-math/logger'

const logger = makeLogger('auth-middlewares')

declare module 'express-session' {
  interface SessionData {
    nonce?: string
    user?: {
      address: `0x${string}`
      chainId: number
      loggedInAt: string
    }
  }
}

export function makeNonce(): string {
  return randomBytes(16).toString('hex')
}

export function getNonce() {
  return (req: Request, res: Response) => {
    const nonce = makeNonce()
    logger.trace(`Nonce Generated: ${nonce}`)
    req.session.nonce = nonce
    res.json({ nonce })
  }
}

// Require an authenticated session for protected routes
export function requireAuth() {
  logger.trace('Request authentication')
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' })
    next()
  }
}

export function attachUserIfPresent() {
  logger.trace('Check if user attached')
  return (req: Request, _res: Response, next: NextFunction) => {
    // @ts-expect-error - you can extend Request type if you prefer
    req.user = req.session.user || null
    next()
  }
}
