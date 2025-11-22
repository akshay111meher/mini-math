import { z } from 'zod'
import express, { Request, Response } from 'express'
import session from 'express-session'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'

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
import { getRoleAdmin, GrantOrRevokeRoleSchema, Role, RoleStore } from '@mini-math/rbac'

import { makeLogger } from '@mini-math/logger'

import { ExternalInputSchema, ID, openapiDoc, ScheduleWorkflowPayload } from './swagger.js'
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
    private queue: IQueue<WorkflowRefType>,
    private kvs: KeyValueStore,
    private domainWithPort: string,
    private siweDomain: string,
    private readonly session_secret: string,
    private readonly secure: boolean,
  ) {
    this.configureMiddleware()
    this.configureRoutes()
  }

  public async start(): Promise<void> {
    const [host, portStr] = this.domainWithPort.split(':')
    const port = Number(portStr ?? 3000)

    await new Promise<void>((resolve) => {
      // this.app.listen(`${this.port}`, () => resolve())
      this.app.listen(port, host, () => resolve())
    })
    this.logger.info(`API on ${this.domainWithPort}  |  Docs: ${this.domainWithPort}/docs`)
  }

  private configureMiddleware(): void {
    const store = new KeyValueSessionStore(this.kvs, {
      prefix: 'sess:',
      defaultTTLSeconds: 60 * 60 * 24,
    })

    this.app.use(express.json())
    this.app.use(helmet())

    this.app.use(
      session({
        name: 'sid',
        secret: this.session_secret,
        store,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: this.secure,
          maxAge: 1000 * 60 * 60 * 24,
        },
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
    const mustHaveRole = revertIfNoRole(this.roleStore)

    this.app.post(
      '/run',
      requireAuth(),
      mustHaveRole([Role.Developer]),
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
      this.handleGrantRole,
    )
    this.app.post(
      '/revokeRole',
      requireAuth(),
      validateBody(GrantOrRevokeRoleSchema),
      this.handleRevokeRole,
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

    this.app.get('/me', requireAuth(), (req, res) => {
      if (req?.session?.user) {
        return res.json({ user: req.session.user })
      } else {
        return res.status(404).json({ user: null })
      }
    })
  }

  private handleGrantRole = async (req: Request, res: Response) => {
    this.logger.trace(
      `User: ${req.user.address} trying to grant ${req.body.role} to ${req.body.user}`,
    )
    const callerRoles = await this.roleStore.getRoles(req.user.address)
    this.logger.trace(`Roles available with ${req.user.address}: ${JSON.stringify(callerRoles)}`)
    const grantingRole = req.body.role
    const roleAdmin = getRoleAdmin(grantingRole)
    this.logger.trace(`${roleAdmin} is on top of role: ${grantingRole}`)

    if (roleAdmin && callerRoles.includes(roleAdmin)) {
      await this.roleStore.addRoleBySchema(req.body)

      return res.status(200).json({
        success: true,
        message: `User: ${req.user.address} granted ${req.body.role} to ${req.body.user}`,
      })
    } else {
      return res.status(401).json({
        success: false,
        message: `User: ${req.user.address} is not allowed to grant ${req.body.role} to ${req.body.user}`,
      })
    }
  }

  private handleRevokeRole = async (req: Request, res: Response) => {
    this.logger.trace(
      `User: ${req.user.address} trying to revoke ${req.body.role} from ${req.body.user}`,
    )
    const callerRoles = await this.roleStore.getRoles(req.user.address)
    this.logger.trace(`Roles available with ${req.user.address}: ${JSON.stringify(callerRoles)}`)

    const revokingRole = req.body.role
    const roleAdmin = getRoleAdmin(revokingRole)
    this.logger.trace(`${roleAdmin} is on top of role: ${revokingRole}`)

    if (roleAdmin && callerRoles.includes(roleAdmin)) {
      await this.roleStore.removeRoleBySchema(req.body)
      return res.status(200).json({
        success: true,
        message: `User: ${req.user.address} revoked ${req.body.role} to ${req.body.user}`,
      })
    } else {
      return res.status(401).json({
        success: false,
        message: `User: ${req.user.address} is not allowed to revoke ${req.body.role} from ${req.body.user}`,
      })
    }
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
      this.logger.debug(`Clocked workflow: ${workflow.id()}`)
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
    this.logger.info(`Loaded workflow: ${wfDef.id}`)

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
