import { z } from 'zod'
import express, { Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'

import {
  Workflow,
  WorkflowSchema,
  WorkflowStore,
  WorkflowCore,
  WorkflowDef,
} from '@mini-math/workflow'
import { NodeFactoryType } from '@mini-math/compiler'
import { RuntimeDef, RuntimeStore } from '@mini-math/runtime'
import { makeLogger } from '@mini-math/logger'

import { ID, openapiDoc } from './swagger.js'
import {
  assignRequestId,
  createNewRuntime,
  validateBody,
  createNewWorkflow,
  revertIfNoWorkflow,
  revertIfNoRuntime,
} from './middlewares/index.js'
import { IQueue } from '@mini-math/queue'

extendZodWithOpenApi(z)

declare module 'express-serve-static-core' {
  interface Request {
    id?: string
    workflowId?: string
    workflow?: WorkflowDef
    runtime?: RuntimeDef
  }
}
export class Server {
  private readonly app = express()
  private readonly logger = makeLogger('RemoteServer')

  constructor(
    private workflowStore: WorkflowStore,
    private runtimeStore: RuntimeStore,
    private nodeFactory: NodeFactoryType,
    private queue: IQueue<[WorkflowDef, RuntimeDef]>,
    private readonly port: number | string = process.env.PORT || 3000,
  ) {
    this.configureMiddleware()
    this.configureRoutes()
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.app.listen(this.port, () => resolve())
    })
    this.logger.info(
      `API on http://localhost:${this.port}  |  Docs: http://localhost:${this.port}/docs`,
    )
  }

  private configureMiddleware(): void {
    this.app.use(express.json())
    this.app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc))
  }

  private configureRoutes(): void {
    this.app.post(
      '/run',
      validateBody(WorkflowSchema),
      createNewRuntime(this.runtimeStore),
      this.handleRun,
    )
    this.app.post('/validate', validateBody(WorkflowCore), this.handleValidate)
    this.app.post('/compile', validateBody(WorkflowCore), this.handleCompile)
    this.app.post(
      '/load',
      validateBody(WorkflowCore),
      assignRequestId,
      createNewWorkflow(this.workflowStore),
      createNewRuntime(this.runtimeStore),
      this.handleLoad,
    )
    this.app.post(
      '/clock',
      validateBody(ID),
      revertIfNoWorkflow(this.workflowStore),
      revertIfNoRuntime(this.runtimeStore),
      this.handleClockWorkflow,
    )
    this.app.post(
      '/initiate',
      validateBody(ID),
      revertIfNoWorkflow(this.workflowStore),
      revertIfNoRuntime(this.runtimeStore),
      this.handleInitiateWorkflow,
    )
  }

  // Handlers as arrow functions to preserve `this`
  private handleRun = async (req: Request, res: Response) => {
    const runtime = req.runtime

    let workflow = new Workflow(req.body, this.nodeFactory, runtime)
    this.logger.trace(`Received workflow: ${workflow.id()}`)

    if (workflow.isFinished()) {
      return res
        .status(409)
        .json({ success: false, message: `Workflow ID: ${workflow.id()} already fullfilled` })
    }

    while (!workflow.isFinished()) {
      const info = await workflow.clock()
      this.logger.debug(`Clocked workflow: ${workflow.id()}`)
      this.logger.trace(JSON.stringify(info))

      const [wf, rt] = workflow.serialize()
      this.logger.trace(JSON.stringify([wf]))
      this.logger.trace(JSON.stringify([rt]))

      await this.runtimeStore.update(workflow.id(), rt)
      workflow = new Workflow(wf, this.nodeFactory, rt)
    }

    this.logger.trace(`Workflow finished: ${workflow.id()}`)
    const [wf] = workflow.serialize()
    return res.json({ success: true, data: wf })
  }

  private handleValidate = async (req: Request, res: Response) => {
    return res.json({ success: true })
  }

  private handleCompile = async (req: Request, res: Response) => {
    try {
      const workflow = new Workflow(req.body, this.nodeFactory)
      workflow.bfs()
      return res.json({ success: true })
    } catch (error) {
      return res.status(400).json({ success: false, error: String(error) })
    }
  }

  private handleLoad = async (req: Request, res: Response) => {
    // Build the engine from the persisted workflow (not req.body!)

    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime

    const workflow = new Workflow(wfDef, this.nodeFactory, rtDef)
    this.logger.info(`Loaded workflow: ${workflow.id()}`)

    // TODO: fix this from types perspective
    return res.status(201).json({ id: req.workflowId })
  }

  private handleClockWorkflow = async (req: Request, res: Response) => {
    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime

    const workflow = new Workflow(wfDef, this.nodeFactory, rtDef)
    if (workflow.isFinished()) {
      return res
        .status(409)
        .json({ success: false, message: `Workflow ID: ${workflow.id()} already fullfilled` })
    }

    await workflow.clock()
    const [_wfDef, _rtDef] = workflow.serialize()
    this.workflowStore.update(workflow.id(), _wfDef)
    this.runtimeStore.update(workflow.id(), _rtDef)

    return res.json([_wfDef, _rtDef])
  }

  private handleInitiateWorkflow = async (req: Request, res: Response) => {
    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime as RuntimeDef // TODO: enfore this by types

    const workflow = new Workflow(wfDef, this.nodeFactory, rtDef)
    if (workflow.isFinished()) {
      return res
        .status(409)
        .json({ success: false, message: `Workflow ID: ${workflow.id()} already fullfilled` })
    }

    this.queue.enqueue([wfDef, rtDef])
    return res.json({ success: true })
  }
}
