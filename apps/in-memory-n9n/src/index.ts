import { NodeFactory } from '@mini-math/compiler'
import { Server } from '@mini-math/remote-server'
import { InMemoryRuntimeStore } from '@mini-math/runtime'
import { InMemoryWorkflowStore, WorkflowRefType, InMemoryBatchStore } from '@mini-math/workflow'
import { RemoteWorker } from '@mini-math/remote-worker'
import { InMemoryKeyValueStore } from '@mini-math/keystore'
import { InMemoryRoleStore, InMemoryUserStore } from '@mini-math/rbac'

import { InMemoryQueue } from '@mini-math/queue'
import { InMemoryCdpStore, InMemorySecretStore } from '@mini-math/secrets'
import { InMemoryImageStore } from '@mini-math/images'

const INIT_PLATFORM_OWNER = '0x29e78bB5ef59a7fa66606c665408D6E680F5a06f'
const nodeFactory = new NodeFactory()
const root_workflow_queue = new InMemoryQueue<WorkflowRefType>()
const workflowPreserveTimeInMs = 60 * 1000
const finished_workflow_queue = new InMemoryQueue<WorkflowRefType>()

const workflowStore = new InMemoryWorkflowStore()
const runtimeStore = new InMemoryRuntimeStore()
const sessionStore = new InMemoryKeyValueStore()
const secretStore = new InMemorySecretStore()
const roleStore = new InMemoryRoleStore(INIT_PLATFORM_OWNER)
const imageStore = new InMemoryImageStore()
const userStore = new InMemoryUserStore()
const cdpAccountStore = new InMemoryCdpStore()
const batchStore = new InMemoryBatchStore(workflowStore, runtimeStore)

for (let i = 1; i <= 10; i++) {
  const worker = new RemoteWorker(
    root_workflow_queue,
    finished_workflow_queue,
    workflowStore,
    runtimeStore,
    secretStore,
    userStore,
    nodeFactory,
    workflowPreserveTimeInMs,
    'webhook-secret',
    10_000,
    `Simple Worker ${i}`,
  )
  worker.start()
}

const DOMAIN = process.env.DOMAIN!
const SIWE_DOMAIN = process.env.SIWE_DOMAIN!
const ETHERSCAN_APIKEY = process.env.ETHERSCAN_APIKEY!

const server = new Server(
  workflowStore,
  runtimeStore,
  nodeFactory,
  roleStore,
  secretStore,
  imageStore,
  userStore,
  root_workflow_queue,
  sessionStore,
  cdpAccountStore,
  batchStore,
  DOMAIN,
  SIWE_DOMAIN,
  { session: 'super-long-session-secret', etherscanApikey: ETHERSCAN_APIKEY },
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
