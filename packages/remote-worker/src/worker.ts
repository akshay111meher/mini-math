import { IQueue } from '@mini-math/queue'
import { RuntimeDef, RuntimeStore } from '@mini-math/runtime'
import { Workflow, WorkflowDef, WorkflowRefType, WorkflowStore } from '@mini-math/workflow'
import { SecretStore } from '@mini-math/secrets'
import { Logger, makeLogger } from '@mini-math/logger'
import { v4 } from 'uuid'
import { NodeFactoryType } from '@mini-math/compiler'

const WORKER_CLOCK_TIME_IN_MS = 100

export class RemoteWorker {
  private logger: Logger
  private workerId: string
  private workerClockTime: number
  private workerName: string

  constructor(
    private queue: IQueue<WorkflowRefType>,
    private workflowStore: WorkflowStore,
    private runtimeStore: RuntimeStore,
    private secretStore: SecretStore,
    private nodeFactory: NodeFactoryType,
    name: string,
  ) {
    this.workerClockTime = WORKER_CLOCK_TIME_IN_MS
    this.workerId = v4()
    this.logger = makeLogger(`Remote Worker: ${name}: ID: ${this.workerId}`)
    this.workerName = name
    this.configure()
  }

  private configure(): void {
    this.queue.onMessage(async (messageId: string, wfId: WorkflowRefType) => {
      try {
        this.logger.debug(`Received message. MessageId: ${messageId}`)
        const lock = await this.workflowStore.acquireLock(wfId, this.workerName)
        if (lock) {
          this.logger.debug(`Acquired lock on workflow ${wfId} successfully`)
          const wf = await this.workflowStore.get(wfId)
          const rt = await this.runtimeStore.get(wfId)
          wf.inProgress = true

          const secrets = await this.secretStore.listSecrets(wf.owner)

          const workflow = new Workflow(wf, this.nodeFactory, secrets, rt.serialize())

          if (workflow.isFinished()) {
            const result = await Promise.all([
              this.workflowStore.update(wfId, { inProgress: false, isInitiated: false }),
              this.queue.ack(messageId),
            ])
            this.logger.trace(JSON.stringify(result))
            return
          }

          const info = await workflow.clock()
          this.logger.debug(`Clocked workflow: ${workflow.id()}`)
          this.logger.trace(JSON.stringify(info))

          if (info.status == 'waiting_for_input') {
            this.logger.debug(
              `Workflow ID: ${wfId} has been paused, as it is expecting input: ${JSON.stringify(info)}`,
            )
            const result = await this.workflowStore.update(workflow.id(), {
              expectingInputFor: info.expectingInputFor,
            })
            this.logger.trace(JSON.stringify(result))

            const result2 = await Promise.all([
              this.workflowStore.releaseLock(wfId),
              this.queue.ack(messageId),
            ])
            this.logger.trace(JSON.stringify(result2))
            return
          }

          this.logger.trace(`Clock Status of workflow: ${info.status}`)

          const [wfNext, rtNext] = workflow.serialize()

          const result = await Promise.all([
            this.workflowStore.update(workflow.id(), wfNext),
            this.runtimeStore.update(workflow.id(), rtNext),
          ])
          this.logger.trace(JSON.stringify(result))

          const result2 = await Promise.all([
            this.workflowStore.releaseLock(wfId),
            this.queue.ack(messageId),
          ])
          this.logger.trace(JSON.stringify(result2))
          this.logger.debug(`Released lock on workflow ${wfId} successfully`)

          // Best: schedule, fire-and-forget, but catch errors so they don't become unhandled rejections
          queueMicrotask(() => {
            void this.queue.enqueue(wfId, this.workerClockTime).catch((err) => {
              this.logger.error('re-enqueue failed', { err })
            })
          })
        } else {
          await this.queue.nack(messageId, true)
        }
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
