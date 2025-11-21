// src/main.ts
import { NodeFactory } from '@mini-math/compiler'
import { Server } from '@mini-math/remote-server'
import { InMemoryRuntimeStore } from '@mini-math/runtime'
import { InMemoryWorkflowStore, WorkflowRefType } from '@mini-math/workflow'
import { RemoteWorker } from '@mini-math/remote-worker'
import { InMemoryKeyValueStore } from '@mini-math/keystore'
import { InMemoryRoleStore } from '@mini-math/rbac'

import { InMemoryQueue } from '@mini-math/queue'
import { InMemorySecretStore } from '@mini-math/secrets'

const INIT_PLATFORM_OWNER = '0x29e78bB5ef59a7fa66606c665408D6E680F5a06f'
const nodeFactory = new NodeFactory()
const queue = new InMemoryQueue<WorkflowRefType>()
const workflowStore = new InMemoryWorkflowStore()
const runtimeStore = new InMemoryRuntimeStore()
const sessionStore = new InMemoryKeyValueStore()
const secretStore = new InMemorySecretStore()
const roleStore = new InMemoryRoleStore(INIT_PLATFORM_OWNER)

const worker1 = new RemoteWorker(
  queue,
  workflowStore,
  runtimeStore,
  secretStore,
  nodeFactory,
  'Simple Worker 1',
)
worker1.start()

const worker2 = new RemoteWorker(
  queue,
  workflowStore,
  runtimeStore,
  secretStore,
  nodeFactory,
  'Simple Worker 2',
)
worker2.start()

const DOMAIN = process.env.DOMAIN!
const SIWE_DOMAIN = process.env.SIWE_DOMAIN!

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

await server.start()

// optional: basic graceful shutdown hooks
const shutdown = (signal: string) => {
  console.log(`\n${signal} received, exiting...`)
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
