import type { RequestHandler } from 'express'
import { RuntimeStore, RuntimeStoreError, RuntimeDef } from '@mini-math/runtime'

declare module 'express-serve-static-core' {
  interface Locals {
    runtime?: RuntimeDef
  }
  interface Request {
    workflowId?: string
    runtime?: RuntimeDef
  }
}

export function revertIfNoRuntime(runtimeStore: RuntimeStore): RequestHandler {
  return async (req, res, next) => {
    const wfId = req.workflowId ?? (req.body?.id as string | undefined)
    if (!wfId) {
      return res.status(400).json({ success: false, message: 'workflow id is required' })
    }

    try {
      const runtime = await runtimeStore.get(wfId)
      req.runtime = runtime.serialize()
      res.locals.runtime = runtime.serialize()
      return next()
    } catch (err) {
      if (err instanceof RuntimeStoreError && err.code === 'NOT_FOUND') {
        return res
          .status(404)
          .json({ success: false, message: `runtime for workflow "${wfId}" not found` })
      }
      const msg = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ success: false, message: msg })
    }
  }
}

export function createNewRuntime(runtimeStore: RuntimeStore): RequestHandler {
  return async (req, res, next) => {
    const wfId = req.workflowId ?? (req.body?.id as string | undefined)
    if (!wfId) {
      return res
        .status(400)
        .json({ success: false, error: { code: 'VALIDATION', message: 'workflow id is required' } })
    }

    try {
      const runtime = await runtimeStore.create(wfId)
      req.runtime = runtime.serialize()
      res.locals.runtime = runtime.serialize()
      return next()
    } catch (err) {
      if (err instanceof RuntimeStoreError) {
        switch (err.code) {
          case 'ALREADY_EXISTS':
            return res.status(409).json({
              success: false,
              error: {
                code: 'ALREADY_EXISTS',
                message: `runtime for workflow "${wfId}" already exists`,
              },
            })
          case 'VALIDATION':
            return res.status(400).json({
              success: false,
              error: { code: 'VALIDATION', message: err.message, details: err.details },
            })
          case 'NOT_FOUND':
            // Unlikely for create(), but mapped for completeness
            return res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: `resource not found: ${wfId}` },
            })
          default:
            return res.status(500).json({
              success: false,
              error: { code: 'UNKNOWN', message: err.message },
            })
        }
      }

      return res.status(500).json({
        success: false,
        error: { code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err) },
      })
    }
  }
}
