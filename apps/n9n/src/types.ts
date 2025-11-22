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
  config as adapterConfig,
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

export class App {
  public static async start_server(DOMAIN: string, SIWE_DOMAIN: string): Promise<void> {
    const server = new Server(
      workflowStore,
      runtimeStore,
      nodeFactory,
      roleStore,
      secretStore,
      queue,
      sessionStore,
      DOMAIN,
      SIWE_DOMAIN,
      'super-long-session-secret',
      false,
    )

    return server.start()
  }

  public static async start_worker(workerName: string): Promise<void> {
    const worker = new RemoteWorker(
      queue,
      workflowStore,
      runtimeStore,
      secretStore,
      nodeFactory,
      workerName,
    )
    return worker.start()
  }
}
