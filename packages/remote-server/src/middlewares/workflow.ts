import type { RequestHandler } from 'express'
import type { WorkflowDef } from '@mini-math/workflow'
import type { WorkflowStore } from '@mini-math/workflow'
import { Workflow, WorkflowStoreError } from '@mini-math/workflow'
import { makeLogger } from '@mini-math/logger'
import { SecretStore } from '@mini-math/secrets'
import { RuntimeDef } from '@mini-math/runtime'
import { NodeFactoryType } from '@mini-math/compiler'

const logger = makeLogger('workflow-middlewares')
declare module 'express-serve-static-core' {
  interface Locals {
    workflow?: WorkflowDef
  }
  interface Request {
    workflowId?: string
    id?: string
    workflow?: WorkflowDef
    initiateWorkflowInMs?: number
  }
}

export function revertIfNotRightConditionForWorkflow(
  secretStore: SecretStore,
  nodeFactory: NodeFactoryType,
  isScheduled: boolean,
): RequestHandler {
  return async (req, res, next) => {
    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime as RuntimeDef // TODO: enfore this by types

    const secrets = await secretStore.listSecrets(req.user.address)

    const workflow = new Workflow(wfDef, nodeFactory, secrets, rtDef)

    if (workflow.isInitiated()) {
      return res.status(400).json({
        success: false,
        message: `Workflow ID: ${workflow.id()} already initiated/scheduled can't initiate again`,
      })
    }

    if (workflow.inProgress()) {
      return res.status(409).json({
        success: false,
        message: `Workflow ID: ${workflow.id()} already initiated and in progress`,
      })
    }

    if (workflow.isFinished()) {
      return res
        .status(409)
        .json({ success: false, message: `Workflow ID: ${workflow.id()} already fullfilled` })
    }

    if (isScheduled) {
      req.initiateWorkflowInMs = req.body.initiateWorkflowInMs || 0
    } else {
      req.initiateWorkflowInMs = 0
    }

    return next()
  }
}

export function revertIfNotWorkflowOwner(workflowStore: WorkflowStore): RequestHandler {
  return async (req, res, next) => {
    const wfId = req.workflowId ?? (req.body?.id as string | undefined)
    if (!wfId) {
      return res.status(400).json({ success: false, message: 'workflow id is required' })
    }

    const wf = await workflowStore.get(wfId)
    if (wf.owner.toLowerCase() == req.user.address.toLowerCase()) {
      return next()
    }

    return res.status(401).json({ success: false, message: `workflow "${wfId}" is not authorized` })
  }
}

export function revertIfNoWorkflow(workflowStore: WorkflowStore): RequestHandler {
  return async (req, res, next) => {
    const wfId = req.workflowId ?? (req.body?.id as string | undefined)
    if (!wfId) {
      return res.status(400).json({ success: false, message: 'workflow id is required' })
    }

    try {
      const workflow = await workflowStore.get(wfId)
      req.workflow = workflow
      res.locals.workflow = workflow
      return next()
    } catch (err) {
      if (err instanceof WorkflowStoreError && err.code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, message: `workflow "${wfId}" not found` })
      }
      const msg = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ success: false, message: msg })
    }
  }
}

export function deleteWorkflowIfExists(workflowStore: WorkflowStore): RequestHandler {
  return async (req, res, next) => {
    const wfId = req.workflowId ?? res.locals?.id ?? (req.body?.id as string | undefined)
    if (!wfId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'workflow id is required' },
      })
    }
    logger.trace(`Trying to delete workflow with id: ${wfId}`)
    try {
      await workflowStore.delete(wfId)
      return next()
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: { code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err) },
      })
    }
  }
}
export function createNewWorkflow(workflowStore: WorkflowStore): RequestHandler {
  return async (req, res, next) => {
    // Accept an id from prior middleware (req.workflowId or res.locals.id) or from body
    const wfId = req.workflowId ?? res.locals?.id ?? (req.body?.id as string | undefined)
    if (!wfId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'workflow id is required' },
      })
    }

    logger.trace(`Trying to workflow with id: ${wfId}`)

    try {
      // Expect req.body to be WorkflowCore (no id inside); store will validate + inject id.
      const def = await workflowStore.create(wfId, req.body, req.user.address)
      req.workflow = def
      res.locals.workflowDef = def
      logger.debug(`Created workflow with id: ${wfId}`)
      return next()
    } catch (err) {
      if (err instanceof WorkflowStoreError) {
        logger.error(`Failed creating workflow with id: ${wfId}`)
        switch (err.code) {
          case 'ALREADY_EXISTS':
            return res.status(409).json({
              success: false,
              error: { code: 'ALREADY_EXISTS', message: `workflow "${wfId}" already exists` },
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
