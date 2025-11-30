import { IQueue } from '@mini-math/queue'
import { RuntimeStore } from '@mini-math/runtime'
import {
  ExpectingInputForType,
  Workflow,
  WorkflowRefType,
  WorkflowStore,
} from '@mini-math/workflow'
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
    this.logger = makeLogger('Remote Worker', { workerId: this.workerId, workerName: name })
    this.workerName = name
    this.configure()
  }

  private configure(): void {
    this.queue.onMessage(async (messageId: string, wfId: WorkflowRefType) => {
      await this.handleMessage(messageId, wfId)
    })
  }

  private async handleMessage(messageId: string, wfId: WorkflowRefType): Promise<void> {
    try {
      this.logger.info(`Received message. MessageId: ${messageId}, wfId: ${wfId}`)

      const lock = await this.workflowStore.acquireLock(wfId, this.workerName)
      if (!lock) {
        this.logger.trace(`Could not acquire lock on workflow ${wfId}, nacking + requeue`)
        await this.queue.nack(messageId, true)
        return
      }

      this.logger.trace(`Acquired lock on workflow ${wfId} successfully`)

      const wf = await this.workflowStore.get(wfId)
      const rt = await this.runtimeStore.get(wfId)
      wf.inProgress = true

      const secrets = await this.secretStore.listSecrets(wf.owner)
      const workflow = new Workflow(wf, this.nodeFactory, secrets, rt.serialize())

      if (workflow.isFinished()) {
        await this.handleFinishedWorkflow(workflow, wfId, messageId)
        return
      }

      const info = await workflow.clock()
      this.logger.trace(`Clocked workflow: ${workflow.id()}`)
      this.logger.trace(JSON.stringify(info))

      if (info.status === 'waiting_for_input') {
        await this.handleWaitingForInput(workflow, wfId, messageId, info)
        return
      }

      await this.handleInProgressWorkflow(workflow, wfId, messageId)
    } catch (error) {
      await this.queue.nack(messageId, true)
      this.logger.error(`Worker error: ${JSON.stringify(error)}`)
    }
  }

  private async handleInProgressWorkflow(
    workflow: Workflow,
    wfId: WorkflowRefType,
    messageId: string,
  ): Promise<void> {
    this.logger.trace(`Clock Status of workflow: continuing`)

    const [wfNext, rtNext] = workflow.serialize()

    const updateResult = await Promise.all([
      this.workflowStore.update(workflow.id(), wfNext),
      this.runtimeStore.update(workflow.id(), rtNext),
    ])
    this.logger.trace(JSON.stringify(updateResult))

    await this.workflowStore.releaseLock(wfId)
    this.logger.trace(`Released lock on workflow ${wfId} successfully`)

    const result2 = await Promise.all([
      this.queue.enqueue(wfId, this.workerClockTime),
      this.queue.ack(messageId),
    ])
    this.logger.trace(JSON.stringify(result2))
  }

  private async handleWaitingForInput(
    workflow: Workflow,
    wfId: WorkflowRefType,
    messageId: string,
    info: { status: string; expectingInputFor: ExpectingInputForType },
  ): Promise<void> {
    this.logger.trace(
      `Workflow ID: ${wfId} has been paused, expecting input: ${JSON.stringify(info)}`,
    )

    const updateResult = await this.workflowStore.update(workflow.id(), {
      expectingInputFor: info.expectingInputFor,
    })
    this.logger.trace(JSON.stringify(updateResult))

    const result2 = await Promise.all([
      this.workflowStore.releaseLock(wfId),
      this.queue.ack(messageId),
    ])
    this.logger.trace(JSON.stringify(result2))
  }

  private async handleFinishedWorkflow(
    workflow: Workflow,
    wfId: WorkflowRefType,
    messageId: string,
  ): Promise<void> {
    this.logger.trace(`Workflow ${wfId} is finished, marking as complete`)

    const result = await this.workflowStore.update(wfId, {
      inProgress: false,
      isInitiated: false,
      lock: undefined,
    })
    this.logger.trace(JSON.stringify(result))

    const nextLinkedWorkflow = workflow.nextLinkedWorkflow()

    if (nextLinkedWorkflow) {
      for (let index = 0; index < nextLinkedWorkflow.length; index++) {
        const element = nextLinkedWorkflow[index]
        this.logger.trace(
          `Initiating next linked workflow: ${element.id} with executionDelay: ${element.executionDelay}`,
        )
        const enqResult = await this.queue.enqueue(element.id, element.executionDelay)
        this.logger.trace(enqResult)
      }
    }

    await this.queue.ack(messageId)
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
