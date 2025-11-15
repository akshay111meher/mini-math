import { Request, Response } from 'express'
import { SiweMessage } from 'siwe'
import z from 'zod'
import { makeLogger } from '@mini-math/logger'
const logger = makeLogger('auth-routes')

import 'express-session'

export interface SessionUser {
  address: `0x${string}`
  chainId: number
  loggedInAt: string
}

const VerifyBody = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
})

declare module 'express-session' {
  interface SessionData {
    nonce?: string
    user?: SessionUser
  }
}

export function logout() {
  return (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie('sid')
      res.json({ ok: true })
    })
  }
}

export function verifySiwe(APP_DOMAIN: string) {
  return async (req: Request, res: Response) => {
    const parse = VerifyBody.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: 'Bad body' })

    const { message, signature } = parse.data

    // Parse the EIP-4361 message
    let siwe: SiweMessage
    try {
      siwe = new SiweMessage(message)
    } catch (err) {
      logger.error(`${(err as Error).message}`)
      return res.status(400).json({ error: 'Invalid SIWE message' })
    }

    // Check domain binding (prevents phishing)
    if (!siwe.domain || siwe.domain !== APP_DOMAIN) {
      logger.trace(`APP_DOMAIN: ${APP_DOMAIN}`)
      logger.trace(`siwe.domain: ${siwe.domain}`)
      return res.status(400).json({ error: 'Domain mismatch' })
    }

    // Basic clock sanity (optional but recommended)
    const now = new Date()
    const issuedAt = siwe.issuedAt ? new Date(siwe.issuedAt) : null
    if (issuedAt && Math.abs(now.getTime() - issuedAt.getTime()) > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'issuedAt too far from now' })
    }
    if (siwe.expirationTime && new Date(siwe.expirationTime) < now) {
      return res.status(400).json({ error: 'Message expired' })
    }

    // Nonce must match session
    if (!req.session.nonce || siwe.nonce !== req.session.nonce) {
      return res.status(401).json({ error: 'Bad or missing nonce' })
    }

    // Verify signature
    try {
      const result = await siwe.verify({ signature })
      if (!result.success) return res.status(401).json({ error: 'Signature invalid' })
    } catch {
      return res.status(400).json({ error: 'Verification failed' })
    }

    // Consume nonce (single use)
    delete req.session.nonce

    // Rotate session id on login (mitigates fixation)
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session rotate failed' })

      req.session.user = {
        address: siwe.address as `0x${string}`,
        chainId: Number(siwe.chainId || 1),
        loggedInAt: new Date().toISOString(),
      }

      res.json({
        ok: true,
        address: req.session.user.address,
        chainId: req.session.user.chainId,
      })
    })
  }
}
