// src/main.ts
import { NodeFactory } from '@mini-math/compiler'
import { Server } from '@mini-math/remote-server'

import { WorkflowRefType } from '@mini-math/workflow'
// import { RemoteWorker } from '@mini-math/remote-worker'
import {
  RedisStore,
  RabbitMQQueue,
  PostgresWorkflowstore,
  PostgresRuntimeStore,
  PostgresRoleStore,
  PostgresSecretStore,
  PostgresImageStore,
  PostgresUserStore,
  config as adapterConfig,
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
const sessionStore = new RedisStore(adapterConfig.getRedisUrl())
const secretStore = new PostgresSecretStore(adapterConfig.getPostgresUrl())
const imageStore = new PostgresImageStore(adapterConfig.getPostgresUrl())
const userStore = new PostgresUserStore(adapterConfig.getPostgresUrl())
const cdpAccountStore = new PostgresCdpAccountStore(adapterConfig.getPostgresUrl())

// const worker1 = new RemoteWorker(
//   queue,
//   workflowStore,
//   runtimeStore,
//   secretStore,
//   nodeFactory,
//   'Simple Worker 1',
// )
// worker1.start()

// const worker2 = new RemoteWorker(
//   queue,
//   workflowStore,
//   runtimeStore,
//   secretStore,
//   nodeFactory,
//   'Simple Worker 2',
// )
// worker2.start()

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
  cdpAccountStore,
  DOMAIN,
  SIWE_DOMAIN,
  'super-long-session-secret',
  ['http://localhost:3000'],
  { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 24 },
  false,
)

async function main() {
  return server.start()
}

main().then(console.log).catch(console.error)

// optional: basic graceful shutdown hooks
const shutdown = (signal: string) => {
  console.log(`\n${signal} received, exiting...`)
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
