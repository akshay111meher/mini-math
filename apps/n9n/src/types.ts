// src/main.ts
import { NodeFactory } from '@mini-math/compiler'
import { Server } from '@mini-math/remote-server'
import { WorkflowRefType } from '@mini-math/workflow'
import { RemoteWorker } from '@mini-math/remote-worker'
import {
  RedisStore,
  RabbitMQQueue,
  PostgresWorkflowstore,
  PostgresRuntimeStore,
  PostgresRoleStore,
  PostgresSecretStore,
  PostgresImageStore,
  config as adapterConfig,
  PostgresUserStore,
  PostgresCdpAccountStore,
} from '@mini-math/adapters'

import { config } from 'dotenv'

config()

const nodeFactory = new NodeFactory()
const queue = new RabbitMQQueue<WorkflowRefType>(adapterConfig.getRabbitMqUrl())
const workflowStore = new PostgresWorkflowstore(adapterConfig.getPostgresUrl())
const runtimeStore = new PostgresRuntimeStore(adapterConfig.getPostgresUrl())
const roleStore = new PostgresRoleStore(
  adapterConfig.getPostgresUrl(),
  adapterConfig.getInitPlatformOwner(),
)
const secretStore = new PostgresSecretStore(adapterConfig.getPostgresUrl())
const sessionStore = new RedisStore(adapterConfig.getRedisUrl())
const imageStore = new PostgresImageStore(adapterConfig.getPostgresUrl())
const userStore = new PostgresUserStore(adapterConfig.getPostgresUrl())
const cdpAccountStore = new PostgresCdpAccountStore(adapterConfig.getPostgresUrl())

export class App {
  public static async start_server(
    DOMAIN: string,
    SIWE_DOMAIN: string,
    allowedOrigins: string[],
    isProd: boolean,
  ): Promise<void> {
    const server = new Server(
      workflowStore,
      runtimeStore,
      nodeFactory,
      roleStore,
      secretStore,
      imageStore,
      userStore,
      queue,
      sessionStore,
      cdpAccountStore,
      DOMAIN,
      SIWE_DOMAIN,
      'super-long-session-secret',
      allowedOrigins,
      {
        httpOnly: isProd,
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 24,
      },
      isProd,
    )

    return server.start()
  }

  public static async start_worker(workerName: string): Promise<void> {
    const worker = new RemoteWorker(
      queue,
      workflowStore,
      runtimeStore,
      secretStore,
      userStore,
      nodeFactory,
      workerName,
    )
    return worker.start()
  }
}
