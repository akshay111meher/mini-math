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
  PostgresBatchStore,
  PostgresKeyValueStore,
} from '@mini-math/adapters'
import { PAYMENT_TOKENS } from '@mini-math/utils'
import { config } from 'dotenv'
import { PaymentListener, PaymentMessage } from '@mini-math/payment-listener'

config()

const nodeFactory = new NodeFactory()
const root_workflow_queue = new RabbitMQQueue<WorkflowRefType>(
  adapterConfig.getRabbitMqUrl(),
  'root_workflow_queue',
  'root_delayed_queue',
  10,
)

const finished_workflow_queue = new RabbitMQQueue<WorkflowRefType>(
  adapterConfig.getRabbitMqUrl(),
  'finished_workflow_queue',
  'finished_delayed_queue',
  1,
)

const workflowPreserveTimeInMs = 30 * 86400 * 1000
const workflowStore = new PostgresWorkflowstore(adapterConfig.getPostgresUrl())
const runtimeStore = new PostgresRuntimeStore(adapterConfig.getPostgresUrl())
const roleStore = new PostgresRoleStore(
  adapterConfig.getPostgresUrl(),
  adapterConfig.getInitPlatformOwner(),
)
const secretStore = new PostgresSecretStore(adapterConfig.getPostgresUrl())
const sessionStore = new RedisStore(adapterConfig.getRedisUrl())
const imageStore = new PostgresImageStore(adapterConfig.getPostgresUrl())
const userStore = new PostgresUserStore(
  adapterConfig.getPostgresUrl(),
  adapterConfig.getPaymentResolver(),
)
const cdpAccountStore = new PostgresCdpAccountStore(adapterConfig.getPostgresUrl())
const batchStore = new PostgresBatchStore(adapterConfig.getPostgresUrl())
const keyValueStore = new PostgresKeyValueStore(adapterConfig.getPostgresUrl())

const payment_queue = new RabbitMQQueue<PaymentMessage>(
  adapterConfig.getRabbitMqUrl(),
  'payment_queue',
  'payment_delay_queue',
  1,
)

export class App {
  public static async start_server(
    DOMAIN: string,
    SIWE_DOMAIN: string,
    allowedOrigins: string[],
    etherscanApikey: string,
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
      root_workflow_queue,
      sessionStore,
      cdpAccountStore,
      batchStore,
      DOMAIN,
      SIWE_DOMAIN,
      { session: 'super-long-session-secret', etherscanApikey },
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

  public static async start_worker(
    workerName: string,
    webhookSecret: string,
    webhookTimeoutInMs: number,
  ): Promise<void> {
    const worker = new RemoteWorker(
      root_workflow_queue,
      finished_workflow_queue,
      workflowStore,
      runtimeStore,
      secretStore,
      userStore,
      nodeFactory,
      workflowPreserveTimeInMs,
      webhookSecret,
      webhookTimeoutInMs,
      workerName,
    )
    return worker.start()
  }

  public static async start_sepolia_payment_listener(sepolia_rpc_url: string): Promise<void> {
    const payment_listener = new PaymentListener(
      keyValueStore,
      userStore,
      'eth-sepolia',
      10026523,
      64,
      sepolia_rpc_url,
      payment_queue,
      [PAYMENT_TOKENS.SEPOLIA_USDC_ADDRESS],
    )

    payment_listener.start()
  }
}
