import { UserRecordSchema } from '@mini-math/rbac'
import z from 'zod'

export const SiweNonceResponse = z.object({ nonce: z.string() }).openapi('SiweNonceResponse')

export const SiweVerifyBody = z
  .object({
    message: z.string().min(1),
    signature: z.string().min(1),
  })
  .openapi('SiweVerifyBody')

export const VerifyResponse = z
  .object({
    ok: z.literal(true),
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    chainId: z.number().int().positive(),
  })
  .openapi('VerifyResponse')

const AuthUser = z
  .object({
    address: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .openapi({ example: '0x1234...abcd' }),
    chainId: z.number().int().positive().openapi({ example: 1 }),
    loggedInAt: z.string().datetime().openapi({ example: new Date().toISOString() }),
  })
  .openapi('AuthUser')

export const MeResponse = z
  .object({
    user: AuthUser.nullable(),
    userData: UserRecordSchema,
  })
  .openapi('MeResponse')

export const LogoutResponse = z.object({ ok: z.literal(true) }).openapi('LogoutResponse')
