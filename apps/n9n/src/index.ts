// src/main.ts
import { NodeFactory } from '@mini-math/compiler'
import { Server } from '@mini-math/remote-server'
import { InMemoryRuntimeStore, RuntimeDef } from '@mini-math/runtime'
import { InMemoryWorkflowStore, WorkflowDef } from '@mini-math/workflow'
import { RemoteWorker } from '@mini-math/remote-worker'
import { RedisStore, RabbitMQQueue } from '@mini-math/adapters'
import { InMemoryRoleStore } from '@mini-math/rbac'

import { config } from 'dotenv'
import { getRedisUrl } from './redis_cfg.js'
import { getRabbitMqUrl } from './rabbitmq_cfg.js'

config()

const INIT_PLATFORM_OWNER = '0x29e78bB5ef59a7fa66606c665408D6E680F5a06f'

const nodeFactory = new NodeFactory()
const queue = new RabbitMQQueue<[WorkflowDef, RuntimeDef]>(getRabbitMqUrl(), 'workflow_queue')
const workflowStore = new InMemoryWorkflowStore()
const runtimeStore = new InMemoryRuntimeStore()
const sessionStore = new RedisStore(getRedisUrl())
const roleStore = new InMemoryRoleStore(INIT_PLATFORM_OWNER)

const worker1 = new RemoteWorker(queue, workflowStore, runtimeStore, nodeFactory, 'Simple Worker 1')
worker1.start()

const worker2 = new RemoteWorker(queue, workflowStore, runtimeStore, nodeFactory, 'Simple Worker 2')
worker2.start()

const DOMAIN = 'localhost:3000'

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

await server.start()

// optional: basic graceful shutdown hooks
const shutdown = (signal: string) => {
  console.log(`\n${signal} received, exiting...`)
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
