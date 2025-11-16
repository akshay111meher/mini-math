import { IQueue } from '@mini-math/queue'
import { RuntimeDef, RuntimeStore } from '@mini-math/runtime'
import { Workflow, WorkflowDef, WorkflowStore } from '@mini-math/workflow'
import { SecretStore } from '@mini-math/secrets'
import { Logger, makeLogger } from '@mini-math/logger'
import { v4 } from 'uuid'
import { NodeFactoryType } from '@mini-math/compiler'

export class RemoteWorker {
  private logger: Logger
  private workerId: string
  constructor(
    private queue: IQueue<[WorkflowDef, RuntimeDef]>,
    private workflowStore: WorkflowStore,
    private runtimeStore: RuntimeStore,
    private secretStore: SecretStore,
    private nodeFactory: NodeFactoryType,
    name: string,
  ) {
    this.workerId = v4()
    this.logger = makeLogger(`Remote Worker: ${name}: ID: ${this.workerId}`)
    this.configure()
  }

  private configure(): void {
    this.queue.onMessage(async (messageId: string, message: [WorkflowDef, RuntimeDef]) => {
      try {
        this.logger.debug(`Received message. MessageId: ${messageId}`)
        const secrets = await this.secretStore.listSecrets(message[0].owner)

        const [wfSnap, rtSnap] = message
        const workflow = new Workflow(wfSnap, this.nodeFactory, secrets, rtSnap)

        if (workflow.isFinished()) {
          await this.queue.ack(messageId)
          return
        }

        const info = await workflow.clock()
        this.logger.debug(`Clocked workflow: ${workflow.id()}`)
        this.logger.trace(JSON.stringify(info))

        const [wfNext, rtNext] = workflow.serialize()

        await Promise.all([
          this.workflowStore.update(workflow.id(), wfNext),
          this.runtimeStore.update(workflow.id(), rtNext),
        ])

        await this.queue.ack(messageId)

        // Best: schedule, fire-and-forget, but catch errors so they don't become unhandled rejections
        queueMicrotask(() => {
          void this.queue.enqueue([wfNext, rtNext]).catch((err) => {
            this.logger.error('re-enqueue failed', { err })
          })
        })
      } catch (err) {
        await this.queue.nack(messageId, true)
        this.logger.error(`Worker error: ${(err as Error).message}`)
      }
    })
  }

  public async start(): Promise<void> {
    this.logger.info('Worker Started')

    // 2. Keep process alive, exit on Ctrl+C / SIGTERM
    await new Promise<void>((resolve) => {
      // big interval just to hold an active handle
      const keepAlive = setInterval(() => {
        // no-op
      }, 1_000_000)

      const shutdown = async (signal: NodeJS.Signals) => {
        this.logger.info(`Received ${signal}. Shutting down worker...`)
        clearInterval(keepAlive)

        try {
          // optional: if your queue supports close / disconnect:
          if (typeof this.queue.close === 'function') {
            await this.queue.close()
          }
        } catch (err) {
          this.logger.error('Error while closing queue', { err })
        }

        process.off('SIGINT', shutdown)
        process.off('SIGTERM', shutdown)
        resolve()
      }

      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })

    this.logger.error('Worker stopped')
  }
}
