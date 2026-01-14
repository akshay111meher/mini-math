import { NodeFactory } from '@mini-math/compiler'
import { Server, devConfig } from '@mini-math/remote-server'
import { InMemoryRuntimeStore } from '@mini-math/runtime'
import { InMemoryWorkflowStore, WorkflowRefType, InMemoryBatchStore } from '@mini-math/workflow'
import { RemoteWorker } from '@mini-math/remote-worker'
import { InMemoryKeyValueStore } from '@mini-math/keystore'
import { InMemoryRoleStore, InMemoryUserStore, InMemoryUserTransactionStore } from '@mini-math/rbac'

import { InMemoryQueue } from '@mini-math/queue'
import { InMemoryCdpStore, InMemorySecretStore } from '@mini-math/secrets'
import { InMemoryImageStore } from '@mini-math/images'

const INIT_PLATFORM_OWNER = devConfig.platformOwner
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
const transactionStore = new InMemoryUserTransactionStore()
const userStore = new InMemoryUserStore(transactionStore)
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

const ETHERSCAN_APIKEY = process.env.ETHERSCAN_APIKEY!

const server = new Server(
  workflowStore,
  runtimeStore,
  nodeFactory,
  roleStore,
  secretStore,
  imageStore,
  userStore,
  transactionStore,
  root_workflow_queue,
  sessionStore,
  cdpAccountStore,
  batchStore,
  devConfig.domain,
  devConfig.siweDomain,
  { session: devConfig.sessionSecret, etherscanApikey: ETHERSCAN_APIKEY },
  devConfig.allowedOrigins,
  devConfig.cookieOptions,
  devConfig.trustProxy,
)

await server.start()

// optional: basic graceful shutdown hooks
const shutdown = (signal: string) => {
  console.log(`\n${signal} received, exiting...`)
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
