// src/main.ts
import { NodeFactory } from '@mini-math/compiler'
import { Server } from '@mini-math/remote-server'
import { RuntimeDef } from '@mini-math/runtime'
import { WorkflowDef } from '@mini-math/workflow'
import { RemoteWorker } from '@mini-math/remote-worker'
import {
  RedisStore,
  RabbitMQQueue,
  PostgresWorkflowstore,
  PostgresRuntimeStore,
  PostgresRoleStore,
  config as adapterConfig,
} from '@mini-math/adapters'

import { config } from 'dotenv'

config()

const nodeFactory = new NodeFactory()
const queue = new RabbitMQQueue<[WorkflowDef, RuntimeDef]>(
  adapterConfig.getRabbitMqUrl(),
  'workflow_queue',
)
const workflowStore = new PostgresWorkflowstore(adapterConfig.getPostgresUrl())
const runtimeStore = new PostgresRuntimeStore(adapterConfig.getPostgresUrl())
const roleStore = new PostgresRoleStore(
  adapterConfig.getPostgresUrl(),
  adapterConfig.getInitPlatformOwner(),
)
const sessionStore = new RedisStore(adapterConfig.getRedisUrl())

export class App {
  public static async start_server(DOMAIN: string): Promise<void> {
    const server = new Server(
      workflowStore,
      runtimeStore,
      nodeFactory,
      roleStore,
      queue,
      sessionStore,
      DOMAIN,
      'super-long-session-secret',
      false,
    )

    return server.start()
  }

  public static async start_worker(workerName: string): Promise<void> {
    const worker = new RemoteWorker(queue, workflowStore, runtimeStore, nodeFactory, workerName)
    return worker.start()
  }
}
