import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { makeLogger } from '@mini-math/logger'

const logger = makeLogger('validate-middleware')

export type BodyOf<T extends z.ZodTypeAny> = z.infer<T>

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }))

      logger.error(
        JSON.stringify({
          msg: 'invalid payload found',
          issues,
        }),
      )

      return res.status(400).json({
        status: false,
        error: 'ValidationError',
        issues,
      })
    }

    // parsed & validated
    req.body = result.data as BodyOf<T>
    return next()
  }
}
