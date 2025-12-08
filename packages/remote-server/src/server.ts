import { z } from 'zod'
import express, { Request, Response } from 'express'
import session from 'express-session'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import cors from 'cors'

import {
  Workflow,
  WorkflowSchema,
  WorkflowStore,
  WorkflowCore,
  WorkflowDef,
  WorkflowRefType,
} from '@mini-math/workflow'
import { NodeFactoryType } from '@mini-math/compiler'
import { RuntimeDef, RuntimeStore } from '@mini-math/runtime'
import {
  GrantCreditDeltaSchema,
  GrantOrRevokeRoleSchema,
  Role,
  RoleStore,
  UserStore,
} from '@mini-math/rbac'

import { makeLogger } from '@mini-math/logger'

import {
  CronedWorkflowCoreSchema,
  ExternalInputSchema,
  ID,
  openapiDoc,
  ScheduleWorkflowPayload,
  StoreWorkflowImageSchema,
} from './swagger/index.js'
import {
  assignRequestId,
  createNewRuntime,
  validateBody,
  createNewWorkflow,
  revertIfNoWorkflow,
  revertIfNoRuntime,
  attachUserIfPresent,
  getNonce,
  requireAuth,
  revertIfNotWorkflowOwner,
  revertIfNoRole,
  deleteWorkflowIfExists,
  deleteRuntimeIfExists,
  revertIfNotRightConditionForWorkflow,
  revertIfNoMinimumStorageCredits,
} from './middlewares/index.js'
import { IQueue } from '@mini-math/queue'
import { logout, verifySiwe } from './auth.js'

import { KeyValueSessionStore } from './keyvalue-session-store.js'
import { KeyValueStore } from '@mini-math/keystore'
import { BaseSecretSchema, SecretIdenfiferSchema, SecretStore } from '@mini-math/secrets'
import {
  handleFetchAllSecretIdentifiers,
  handleFetchSecret,
  handleRemoveSecret,
  handleStoreSecret,
} from './secret.js'
import { ensureMaxSecretsCount } from './middlewares/secret.js'
import { handleCronJob } from './cron.js'
import { handleStoreImage } from './image/storeImage.js'
import { WorkflowNameSchema } from './swagger/image.js'
import { handleImageExists } from './image/existImage.js'
import { ImageStore } from '@mini-math/images'
import { handleDeleteImage } from './image/deleteImage.js'
import { ListOptionsSchema } from '@mini-math/utils'
import { handleListImages } from './image/listImages.js'
import { handleCountImages } from './image/countImage.js'
import { handleGrantCredits, handleGrantRole, handleRevokeRole } from './rbac/index.js'

extendZodWithOpenApi(z)

export class Server {
  private readonly app = express()
  private readonly logger = makeLogger('RemoteServer')

  constructor(
    private workflowStore: WorkflowStore,
    private runtimeStore: RuntimeStore,
    private nodeFactory: NodeFactoryType,
    private roleStore: RoleStore,
    private secretStore: SecretStore,
    private imageStore: ImageStore,
    private userStore: UserStore,
    private queue: IQueue<WorkflowRefType>,
    private kvs: KeyValueStore,
    private domainWithPort: string,
    private siweDomain: string,
    private readonly session_secret: string,
    private allowedOrigins: string[],
    private cookieOptions: session.CookieOptions,
    private trustProxy: boolean,
  ) {
    this.configureMiddleware()
    this.configureRoutes()
  }

  public async start(): Promise<void> {
    // this.domainWithPort can be either:
    // - "localhost:1101"
    // - "0.0.0.0:1101"
    // - or a full URL like "http://localhost:1101"
    let host: string
    let port: number

    if (this.domainWithPort.includes('://')) {
      // treat it as URL
      const url = new URL(this.domainWithPort)
      host = url.hostname
      port = Number(url.port || 3000)
    } else {
      const [maybeHost, maybePort] = this.domainWithPort.split(':')
      host = maybeHost || '0.0.0.0'
      port = maybePort ? Number(maybePort) : 3000
    }

    if (!Number.isFinite(port) || port <= 0 || port >= 65536) {
      throw new Error(`Invalid port in domainWithPort: "${this.domainWithPort}" → ${port}`)
    }

    await new Promise<void>((resolve, reject) => {
      const httpServer = this.app.listen(port, host, () => {
        this.logger.info(`API on ${host}:${port}  |  Docs: http://${host}:${port}/docs`)
        resolve()
      })

      httpServer.on('error', (err) => {
        this.logger.error(`Failed to start server: ${(err as Error).message}`)
        reject(err)
      })
    })
  }

  private configureMiddleware(): void {
    const store = new KeyValueSessionStore(this.kvs, {
      prefix: 'sess:',
      defaultTTLSeconds: 60 * 60 * 24,
    })

    const allowedOrigins = this.allowedOrigins

    const corsMiddleware = cors({
      origin: allowedOrigins,
      credentials: true,
    })

    this.app.use(corsMiddleware)
    this.app.use((req, res, next) => {
      if (req.method === 'OPTIONS') {
        corsMiddleware(req, res, next)
      } else {
        next()
      }
    })
    this.app.use(express.json({ limit: '500kb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '500kb' }))

    this.app.use(helmet())

    this.app.use(
      session({
        name: 'sid',
        secret: this.session_secret,
        store,
        resave: false,
        saveUninitialized: false,
        proxy: this.trustProxy,
        cookie: this.cookieOptions,
      }),
    )

    this.app.use(attachUserIfPresent())

    type SwaggerInterceptorReq = {
      credentials?: 'include' | 'omit' | 'same-origin'
    } & Record<string, unknown>

    this.app.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(openapiDoc, {
        swaggerOptions: {
          // Ensure cookies are sent with "Try it out"
          withCredentials: true,
          requestInterceptor: (req: SwaggerInterceptorReq) => {
            req.credentials = 'include'
            return req
          },
        },
      }),
    )
  }

  private configureRoutes(): void {
    const mustHaveOneOfTheRole = revertIfNoRole(this.roleStore)
    const mustHaveMinimumStorageCredits = revertIfNoMinimumStorageCredits(this.userStore)

    this.app.post(
      '/run',
      requireAuth(),
      mustHaveOneOfTheRole([Role.Developer]),
      validateBody(WorkflowSchema),
      deleteWorkflowIfExists(this.workflowStore),
      deleteRuntimeIfExists(this.runtimeStore),
      createNewWorkflow(this.workflowStore),
      createNewRuntime(this.runtimeStore),
      this.handleRun,
    )

    this.app.post('/clock', this.handleClockWorkflow)

    this.app.post('/validate', validateBody(WorkflowCore), this.handleValidate)
    this.app.post('/compile', validateBody(WorkflowCore), this.handleCompile)
    this.app.post(
      '/load',
      requireAuth(),
      validateBody(WorkflowCore),
      assignRequestId,
      createNewWorkflow(this.workflowStore),
      createNewRuntime(this.runtimeStore),
      this.handleLoad,
    )

    this.app.post(
      '/initiate',
      requireAuth(),
      validateBody(ID),
      revertIfNotWorkflowOwner(this.workflowStore),
      revertIfNoWorkflow(this.workflowStore),
      revertIfNoRuntime(this.runtimeStore),
      revertIfNotRightConditionForWorkflow(this.secretStore, this.nodeFactory, false),
      this.handleInitiateWorkflow,
    )

    this.app.post(
      '/schedule',
      requireAuth(),
      validateBody(ScheduleWorkflowPayload),
      revertIfNotWorkflowOwner(this.workflowStore),
      revertIfNoWorkflow(this.workflowStore),
      revertIfNoRuntime(this.runtimeStore),
      revertIfNotRightConditionForWorkflow(this.secretStore, this.nodeFactory, true),
      this.handleInitiateWorkflow,
    )

    this.app.post(
      '/externalInput',
      requireAuth(),
      validateBody(ExternalInputSchema),
      revertIfNotWorkflowOwner(this.workflowStore),
      revertIfNoWorkflow(this.workflowStore),
      revertIfNoRuntime(this.runtimeStore),
      this.handleSubmitInputs,
    )

    this.app.post(
      '/fetch',
      requireAuth(),
      validateBody(ID),
      revertIfNotWorkflowOwner(this.workflowStore),
      revertIfNoWorkflow(this.workflowStore),
      revertIfNoRuntime(this.runtimeStore),
      this.handleFetchWorkflowResult,
    )

    this.app.get('/siwe/nonce', getNonce())
    this.app.post('/siwe/verify', verifySiwe(this.siweDomain))
    this.app.post('/logout', requireAuth(), logout())

    this.app.post(
      '/grantRole',
      requireAuth(),
      validateBody(GrantOrRevokeRoleSchema),
      handleGrantRole(this.roleStore),
    )

    this.app.post(
      '/grantCredits',
      requireAuth(),
      mustHaveOneOfTheRole([Role.PlatformOwner]),
      validateBody(GrantCreditDeltaSchema),
      handleGrantCredits(this.userStore),
    )
    this.app.post(
      '/revokeRole',
      requireAuth(),
      validateBody(GrantOrRevokeRoleSchema),
      handleRevokeRole(this.roleStore),
    )

    this.app.post(
      '/storeSecret',
      requireAuth(),
      validateBody(BaseSecretSchema),
      ensureMaxSecretsCount(this.secretStore),
      handleStoreSecret(this.secretStore),
    )

    this.app.post(
      '/removeSecret',
      requireAuth(),
      validateBody(SecretIdenfiferSchema),
      handleRemoveSecret(this.secretStore),
    )

    this.app.post(
      '/fetchSecret',
      requireAuth(),
      validateBody(SecretIdenfiferSchema),
      handleFetchSecret(this.secretStore),
    )

    this.app.get(
      '/fetchAllSecretIdentifiers',
      requireAuth(),
      handleFetchAllSecretIdentifiers(this.secretStore),
    )

    this.app.post(
      '/cron',
      requireAuth(),
      validateBody(CronedWorkflowCoreSchema),
      handleCronJob(this.workflowStore, this.runtimeStore, this.queue, this.nodeFactory),
    )

    this.app.post(
      '/storeImage',
      requireAuth(),
      mustHaveMinimumStorageCredits(1),
      validateBody(StoreWorkflowImageSchema),
      handleStoreImage(this.imageStore, this.userStore),
    )

    this.app.post(
      '/existImage',
      requireAuth(),
      validateBody(WorkflowNameSchema),
      handleImageExists(this.imageStore),
    )

    this.app.post(
      '/deleteImage',
      requireAuth(),
      validateBody(WorkflowNameSchema),
      handleDeleteImage(this.imageStore),
    )

    this.app.post(
      '/listImages',
      requireAuth(),
      validateBody(ListOptionsSchema),
      handleListImages(this.imageStore),
    )

    this.app.get('/countImages', requireAuth(), handleCountImages(this.imageStore))

    this.app.get('/me', requireAuth(), async (req, res) => {
      if (req?.session?.user) {
        const userData = await this.userStore.get(req.session.user.address)
        return res.json({ user: req.session.user, userData })
      } else {
        return res.status(404).json({ user: null })
      }
    })
  }

  // Handlers as arrow functions to preserve `this`
  private handleRun = async (req: Request, res: Response) => {
    this.logger.trace('direct workflow request received')
    const runtime = req.runtime
    const secrets = await this.secretStore.listSecrets(req.user.address)
    this.logger.trace('fetched secrets')
    let workflow = new Workflow(req.body, this.nodeFactory, secrets, runtime)
    this.logger.trace(`Received workflow: ${workflow.id()}`)

    if (workflow.isFinished()) {
      return res
        .status(409)
        .json({ success: false, message: `Workflow ID: ${workflow.id()} already fullfilled` })
    }

    if (workflow.hasExternalInput()) {
      return res.status(400).json({
        success: false,
        message: `Workflow ID: ${workflow.id()} with external input can''t be run, they must be loaded and then initiated/scheduled`,
      })
    }

    while (!workflow.isFinished()) {
      const info = await workflow.clock()
      this.logger.trace(`Clocked workflow: ${workflow.id()}`)
      this.logger.trace(JSON.stringify(info))

      const [wf, rt] = workflow.serialize()
      this.logger.trace(JSON.stringify(wf))
      this.logger.trace(JSON.stringify(rt))

      if (info.status == 'error') {
        return res.status(400).json({
          status: info.status,
          error: info.code,
          data: { workflow: wf, runtime: rt },
        })
      }

      if (info.status == 'terminated') {
        return res.status(410).json({
          status: info.status,
          data: { workflow: wf, runtime: rt, node: info.node, exec: info.exec },
        })
      }

      await this.workflowStore.update(workflow.id(), wf)
      await this.runtimeStore.update(workflow.id(), rt)
      workflow = new Workflow(wf, this.nodeFactory, secrets, rt)
    }

    this.logger.trace(`Workflow finished: ${workflow.id()}`)
    const [wf] = workflow.serialize()
    this.workflowStore.delete(workflow.id())
    this.runtimeStore.delete(workflow.id())
    return res.json(wf)
  }

  private handleValidate = async (req: Request, res: Response) => {
    return res.json({ success: true })
  }

  private handleCompile = async (req: Request, res: Response) => {
    try {
      Workflow.syntaxCheck(req.body, this.nodeFactory)
      return res.json({ success: true })
    } catch (error) {
      return res.status(400).json({ success: false, error: String(error) })
    }
  }

  private handleLoad = async (req: Request, res: Response) => {
    // Build the engine from the persisted workflow (not req.body!)

    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types

    Workflow.syntaxCheck(wfDef, this.nodeFactory)
    this.logger.debug(`Loaded workflow: ${wfDef.id}`)

    // TODO: fix this from types perspective
    return res.status(201).json({ id: req.workflowId })
  }

  private handleClockWorkflow = async (req: Request, res: Response) => {
    return res.status(400).json({ success: false, message: 'revoked' })
  }

  private handleInitiateWorkflow = async (req: Request, res: Response) => {
    const id = req.workflow?.id
    if (!id) {
      return res.status(500).json({ status: false, message: 'Failed to initiate workflow' })
    } else {
      const delayTime = req.initiateWorkflowInMs || 0
      const result1 = await this.workflowStore.update(id, { isInitiated: true })
      const result2 = await this.queue.enqueue(id, delayTime)
      this.logger.trace(JSON.stringify(result1))
      this.logger.trace(JSON.stringify(result2))
      return res.json({ success: true })
    }
  }

  private handleSubmitInputs = async (req: Request, res: Response) => {
    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime as RuntimeDef // TODO: enfore this by types

    const workflow = new Workflow(wfDef, this.nodeFactory, [], rtDef)
    if (workflow.isFinished()) {
      return res.status(200).json({ status: 'finished', result: wfDef })
    }

    const expectingInputFor = workflow.expectingInputFor()
    if (expectingInputFor) {
      const inputFromUser = req.body as z.infer<typeof ExternalInputSchema>
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
        this.workflowStore.update(workflow.id(), {
          externalInputStorage: updatedExternalInputStorage,
          expectingInputFor: undefined,
        }),
        //TODO:  added little delay on purpose, ideally not required, make relevant tests to see atomicity
        await this.queue.enqueue(workflow.id()),
      ])

      this.logger.trace(JSON.stringify(result))
      return res.json({ success: true })
    } else {
      return res.status(400).json({ status: false, message: 'Not expecting any input' })
    }
  }

  private handleFetchWorkflowResult = async (req: Request, res: Response) => {
    const wfDef = req.workflow as WorkflowDef // TODO: enfore this by types
    const rtDef = req.runtime as RuntimeDef // TODO: enfore this by types

    const workflow = new Workflow(wfDef, this.nodeFactory, [], rtDef)
    if (workflow.isFinished()) {
      return res.status(200).json({ status: 'finished', result: wfDef })
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
}
