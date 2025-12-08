// src/main.ts
import { NodeFactory } from '@mini-math/compiler'
import { Server } from '@mini-math/remote-server'
import { InMemoryRuntimeStore } from '@mini-math/runtime'
import { InMemoryWorkflowStore, WorkflowRefType } from '@mini-math/workflow'
import { RemoteWorker } from '@mini-math/remote-worker'
import { InMemoryKeyValueStore } from '@mini-math/keystore'
import { InMemoryRoleStore, InMemoryUserStore } from '@mini-math/rbac'

import { InMemoryQueue } from '@mini-math/queue'
import { InMemorySecretStore } from '@mini-math/secrets'
import { InMemoryImageStore } from '@mini-math/images'

const INIT_PLATFORM_OWNER = '0x29e78bB5ef59a7fa66606c665408D6E680F5a06f'
const nodeFactory = new NodeFactory()
const queue = new InMemoryQueue<WorkflowRefType>()
const workflowStore = new InMemoryWorkflowStore()
const runtimeStore = new InMemoryRuntimeStore()
const sessionStore = new InMemoryKeyValueStore()
const secretStore = new InMemorySecretStore()
const roleStore = new InMemoryRoleStore(INIT_PLATFORM_OWNER)
const imageStore = new InMemoryImageStore()
const userStore = new InMemoryUserStore()

for (let i = 1; i <= 10; i++) {
  const worker = new RemoteWorker(
    queue,
    workflowStore,
    runtimeStore,
    secretStore,
    nodeFactory,
    `Simple Worker ${i}`,
  )
  worker.start()
}

const DOMAIN = process.env.DOMAIN!
const SIWE_DOMAIN = process.env.SIWE_DOMAIN!

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
  DOMAIN,
  SIWE_DOMAIN,
  'super-long-session-secret',
  ['http://localhost:3000'],
  { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 24 },
  true,
)

await server.start()

// optional: basic graceful shutdown hooks
const shutdown = (signal: string) => {
  console.log(`\n${signal} received, exiting...`)
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
