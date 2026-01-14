import { Router, Request, Response } from 'express'
import { validateBody } from '../../middlewares/validate.js'
import {
  Workflow,
  WorkflowCore,
  WorkflowDef,
  WorkflowRefType,
  WorkflowStore,
} from '@mini-math/workflow'
import { NodeFactoryType } from '@mini-math/compiler'
import {
  assignRequestId,
  createNewRuntime,
  createNewWorkflow,
  requireAuth,
  revertIfNoRuntime,
  revertIfNotRightConditionForWorkflow,
  revertIfNotWorkflowOwner,
  revertIfNoWorkflow,
} from '../../middlewares/index.js'
import { RuntimeDef, RuntimeStore } from '@mini-math/runtime'
import { Logger } from '@mini-math/logger'

import { SecretStore } from '@mini-math/secrets'
import { IQueue } from '@mini-math/queue'
import z from 'zod'
import { handleCronJob } from '../..//cron.js'
import { CommonSchemas } from '../../schemas/index.js'
import { deepClone, ListOptionsSchema } from '@mini-math/utils'
import { handleListWorkflows } from './listWorkflow.js'

export { doc } from './swagger.js'

type PlainObject = Record<string, unknown>

const PATH_TOKEN_REGEX = /[^.[\]]+|\[(?:([^"'[\]]+)|["']([^"'[\]]+)["'])\]/g

const isRecord = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const tokenizePath = (path: string): string[] => {
  if (!path) return []

  const tokens: string[] = []

  path.replace(PATH_TOKEN_REGEX, (segment, unquoted, quoted) => {
    tokens.push((unquoted ?? quoted ?? segment).replace(/^\[|\]$/g, ''))
    return ''
  })

  return tokens
}

const getGlobalValue = (globalState: PlainObject, path: string): unknown => {
  const tokens = tokenizePath(path)
  if (tokens.length === 0) {
    return globalState
  }

  let current: unknown = globalState

  for (const token of tokens) {
    if (!isRecord(current) || !(token in current)) {
      return undefined
    }
    current = current[token]
  }

  return current
}

const resolveVariablesInString = (raw: string, globalState: PlainObject): string => {
  if (typeof raw !== 'string' || !raw.includes('${')) return raw

  const genericVars: PlainObject = {
    now: new Date().toISOString(),
    today: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    random: Math.random(),
  }

  return raw.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const trimmedVarName = varName.trim()

    // 1. Generic variables
    if (Object.prototype.hasOwnProperty.call(genericVars, trimmedVarName)) {
      const value = genericVars[trimmedVarName]
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    }

    // 2. Global state (populated by previous nodes)
    const globalValue = getGlobalValue(globalState, trimmedVarName)
    if (typeof globalValue !== 'undefined') {
      return typeof globalValue === 'object' ? JSON.stringify(globalValue) : String(globalValue)
    }

    // 3. Leave as-is if unresolved
    return match
  })
}

const resolveVariablesInData = (data: unknown, globalState: PlainObject): unknown => {
  if (data === null || data === undefined) return data

  if (typeof data === 'string') {
    return resolveVariablesInString(data, globalState)
  }

  if (Array.isArray(data)) {
    return data.map((item) => resolveVariablesInData(item, globalState))
  }

  if (isRecord(data)) {
    const out: PlainObject = {}
    for (const [key, value] of Object.entries(data)) {
      out[key] = resolveVariablesInData(value, globalState)
    }
    return out
  }

  return data
}

const resolveWorkflowResult = (wfDef: WorkflowDef): WorkflowDef => {
  const clone = deepClone(wfDef)
  const globalState = ((clone as unknown as { globalState?: PlainObject }).globalState ??
    {}) as PlainObject

  // Resolve placeholders across the entire cloned workflow definition
  const resolved = resolveVariablesInData(clone, globalState) as WorkflowDef
  return resolved
}

export function create(
  nodeFactory: NodeFactoryType,
  workflowStore: WorkflowStore,
  runtimeStore: RuntimeStore,
  secretStore: SecretStore,
  queue: IQueue<WorkflowRefType>,
  logger: Logger,
): Router {
  const router = Router()

  const handleInitiate = async (req: Request, res: Response) => {
    const id = req.workflow?.id
    if (!id) {
      return res.status(500).json({ status: false, message: 'Failed to initiate workflow' })
    } else {
      const delayTime = req.initiateWorkflowInMs || 0
      const result1 = await workflowStore.update(id, { isInitiated: true })
      const result2 = await queue.enqueue(id, delayTime)
      logger.trace(JSON.stringify(result1))
      logger.trace(JSON.stringify(result2))
      return res.json({ success: true })
    }
  }
  const handleSubmitInputs = async (req: Request, res: Response) => {
    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime as RuntimeDef // TODO: enfore this by types

    const workflow = new Workflow(wfDef, nodeFactory, [], rtDef)
    if (workflow.isFinished()) {
      return res.status(409).json({ status: false, data: wfDef })
    }

    const expectingInputFor = workflow.expectingInputFor()
    if (expectingInputFor) {
      const inputFromUser = req.body as z.infer<typeof CommonSchemas.ExternalInputSchema>
      if (expectingInputFor.node != inputFromUser.nodeId) {
        return res.status(400).json({
          status: false,
          message: `Expecting input to node: ${expectingInputFor.node} and not ${inputFromUser.nodeId}`,
        })
      }

      if (expectingInputFor.inputId != inputFromUser.externalInputId) {
        return res.status(400).json({
          status: false,
          message: `Expecting input for inputID: ${expectingInputFor.inputId} and not ${inputFromUser.externalInputId}`,
        })
      }

      const updatedExternalInputStorage = workflow.appendExternalInput(
        inputFromUser.nodeId,
        inputFromUser.externalInputId,
        inputFromUser.data,
      )
      const result = await Promise.all([
        workflowStore.update(workflow.id(), {
          externalInputStorage: updatedExternalInputStorage,
          expectingInputFor: undefined,
        }),
        //TODO:  added little delay on purpose, ideally not required, make relevant tests to see atomicity
        await queue.enqueue(workflow.id()),
      ])

      logger.trace(JSON.stringify(result))
      return res.json({ success: true })
    } else {
      return res.status(400).json({ status: false, message: 'Not expecting any input' })
    }
  }

  const handleFetchWorkflowResult = async (req: Request, res: Response) => {
    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime as RuntimeDef // TODO: enfore this by types

    const workflow = new Workflow(wfDef, nodeFactory, [], rtDef)
    if (workflow.isFinished()) {
      const resolved = resolveWorkflowResult(wfDef)
      return res.status(200).json({ status: 'finished', result: resolved })
    }

    if (workflow.isTerminated()) {
      const resolved = resolveWorkflowResult(wfDef)
      return res.status(206).json({ status: 'terminated', result: resolved })
    }

    const expectingInputFor = workflow.expectingInputFor()
    if (expectingInputFor) {
      return res.status(206).json({ status: 'awaitingInput', expectingInputFor })
    }

    if (workflow.inProgress()) {
      return res.status(206).json({ status: 'inProgress' })
    }

    if (workflow.isInitiated()) {
      return res.status(206).json({ status: 'initiated' })
    }

    return res.status(200).json({ status: 'idle' })
  }

  router.post('/validate', validateBody(WorkflowCore), async (req, res) => {
    return res.json({ success: true })
  })

  router.post('/compile', validateBody(WorkflowCore), async (req, res) => {
    try {
      Workflow.syntaxCheck(req.body, nodeFactory)
      return res.json({ success: true })
    } catch (error) {
      return res.status(400).json({ success: false, error: String(error) })
    }
  })

  router.post(
    '/load',
    requireAuth(),
    validateBody(WorkflowCore),
    assignRequestId,
    createNewWorkflow(workflowStore),
    createNewRuntime(runtimeStore),
    async (req, res) => {
      // Build the engine from the persisted workflow (not req.body!)

      const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types

      Workflow.syntaxCheck(wfDef, nodeFactory)
      logger.debug(`Loaded workflow: ${wfDef.id}`)

      // TODO: fix this from types perspective
      return res.status(201).json({ id: req.workflowId })
    },
  )

  router.post(
    '/initiate',
    requireAuth(),
    validateBody(CommonSchemas.ID),
    revertIfNotWorkflowOwner(workflowStore),
    revertIfNoWorkflow(workflowStore),
    revertIfNoRuntime(runtimeStore),
    revertIfNotRightConditionForWorkflow(secretStore, nodeFactory, false),
    handleInitiate,
  )

  router.post(
    '/schedule',
    requireAuth(),
    validateBody(CommonSchemas.ScheduleWorkflowPayload),
    revertIfNotWorkflowOwner(workflowStore),
    revertIfNoWorkflow(workflowStore),
    revertIfNoRuntime(runtimeStore),
    revertIfNotRightConditionForWorkflow(secretStore, nodeFactory, true),
    handleInitiate,
  )

  router.post(
    '/externalInput',
    requireAuth(),
    validateBody(CommonSchemas.ExternalInputSchema),
    revertIfNotWorkflowOwner(workflowStore),
    revertIfNoWorkflow(workflowStore),
    revertIfNoRuntime(runtimeStore),
    handleSubmitInputs,
  )

  router.post(
    '/fetch',
    requireAuth(),
    validateBody(CommonSchemas.ID),
    revertIfNotWorkflowOwner(workflowStore),
    revertIfNoWorkflow(workflowStore),
    revertIfNoRuntime(runtimeStore),
    handleFetchWorkflowResult,
  )

  router.post(
    '/cron',
    requireAuth(),
    validateBody(CommonSchemas.CronedWorkflowCoreSchema),
    handleCronJob(workflowStore, runtimeStore, queue, nodeFactory),
  )

  router.post(
    '/listWorkflows',
    requireAuth(),
    validateBody(ListOptionsSchema),
    handleListWorkflows(workflowStore),
  )

  return router
}
