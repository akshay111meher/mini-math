export * from './validate.js'
export * from './runtime.js'
export * from './workflow.js'

import type { RequestHandler } from 'express'
import { v4 as uuidv4 } from 'uuid'

// types/express.d.ts  (ensure tsconfig includes this)
declare module 'express-serve-static-core' {
  interface Locals {
    id?: string
  }
}

export const assignRequestId: RequestHandler = (req, res, next) => {
  const id = uuidv4()
  req.workflowId = id
  res.locals.id = id
  next()
}
