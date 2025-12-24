import { z } from 'zod'
import express from 'express'
import session from 'express-session'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import cors from 'cors'

import { WorkflowStore, WorkflowRefType, BatchStore } from '@mini-math/workflow'
import { NodeFactoryType } from '@mini-math/compiler'
import { RuntimeStore } from '@mini-math/runtime'
import { RoleStore, UserStore } from '@mini-math/rbac'

import { makeLogger } from '@mini-math/logger'
import {
  attachUserIfPresent,
  revertIfNoRole,
  revertIfNoMinimumStorageCredits,
  revertIfNoMinimumCdpCredits,
} from './middlewares/index.js'
import { IQueue } from '@mini-math/queue'

import { KeyValueSessionStore } from './keyvalue-session-store.js'
import { KeyValueStore } from '@mini-math/keystore'
import { CdpAccountStore, SecretStore } from '@mini-math/secrets'

import { ImageStore } from '@mini-math/images'

import {
  AuthRouter,
  CdpRouter,
  DevRouter,
  ImageRouter,
  RbacRouter,
  SecretRouter,
  WorkflowRouter,
  FeHelperRouter,
  BatchJobRouter,
} from './routers/index.js'

import { openapiDoc } from './swagger/index.js'

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
    private cdpAccountStore: CdpAccountStore,
    private batchStore: BatchStore,
    private domainWithPort: string,
    private siweDomain: string,
    private readonly secrets: { session: string; etherscanApikey: string },
    private allowedOrigins: string[],
    private cookieOptions: session.CookieOptions,
    private trustProxy: boolean,
  ) {
    this.configureMiddleware()
    this.configureRouters()
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
        secret: this.secrets.session,
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

  private configureRouters(): void {
    const mustHaveOneOfTheRole = revertIfNoRole(this.roleStore)
    const mustHaveMinimumStorageCredits = revertIfNoMinimumStorageCredits(this.userStore)
    const mustHaveMinCdpAccountCredits = revertIfNoMinimumCdpCredits(this.userStore)

    this.app.use(AuthRouter.create(this.userStore, this.siweDomain))
    this.app.use(
      DevRouter.create(
        mustHaveOneOfTheRole,
        this.workflowStore,
        this.runtimeStore,
        this.secretStore,
        this.nodeFactory,
        this.logger,
      ),
    )

    this.app.use(
      WorkflowRouter.create(
        this.nodeFactory,
        this.workflowStore,
        this.runtimeStore,
        this.secretStore,
        this.queue,
        this.logger,
      ),
    )

    this.app.use(RbacRouter.create(mustHaveOneOfTheRole, this.roleStore, this.userStore))
    this.app.use(
      CdpRouter.basePath,
      CdpRouter.create(this.cdpAccountStore, this.userStore, mustHaveMinCdpAccountCredits),
    )

    this.app.use(
      FeHelperRouter.basePath,
      FeHelperRouter.create(this.secrets.etherscanApikey, this.logger),
    )

    this.app.use(SecretRouter.create(this.secretStore))
    this.app.use(ImageRouter.create(mustHaveMinimumStorageCredits, this.imageStore, this.userStore))
    this.app.use(
      BatchJobRouter.basePath,
      BatchJobRouter.create(this.batchStore, this.queue, this.logger),
    )
  }
}
