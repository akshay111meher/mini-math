import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { makeLogger } from '@mini-math/logger'

const logger = makeLogger('validate-middleware')

export type BodyOf<T extends z.ZodTypeAny> = z.infer<T>

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      logger.trace(`invalid payload found: ${schema}`)
      const issues = result.error.issues
      return res.status(400).json({ status: false, error: 'ValidationError', issues })
    }
    // replace body with parsed value (if you used e.g. transformations)
    req.body = result.data as BodyOf<T>
    next()
  }
}
