import { IQueue } from '@mini-math/queue'
import { RuntimeStore } from '@mini-math/runtime'
import {
  ClockOk,
  ExpectingInputForType,
  Workflow,
  WorkflowRefType,
  WorkflowStore,
} from '@mini-math/workflow'
import { SecretStore } from '@mini-math/secrets'
import { Logger, makeLogger } from '@mini-math/logger'
import { v4 } from 'uuid'
import { NodeFactoryType } from '@mini-math/compiler'
import { UserStore } from '@mini-math/rbac'

import axios from 'axios'
import crypto from 'node:crypto'

const WORKER_CLOCK_TIME_IN_MS = 100
const WEBHOOK_MAX_TIMEOUT = 60_000

export class RemoteWorker {
  private logger: Logger
  private workerId: string
  private workerClockTime: number
  private workerName: string

  constructor(
    private root_workflow_queue: IQueue<WorkflowRefType>,
    private finished_workflow_queue: IQueue<WorkflowRefType>,
    private workflowStore: WorkflowStore,
    private runtimeStore: RuntimeStore,
    private secretStore: SecretStore,
    private userStore: UserStore,
    private nodeFactory: NodeFactoryType,
    private workflowPreserveTimeInMs: number,
    private webhookSecret: string,
    private webhookTimeoutInMs: number,
    name: string,
  ) {
    this.workerClockTime = WORKER_CLOCK_TIME_IN_MS
    this.workerId = v4()
    this.logger = makeLogger('Remote Worker', { workerId: this.workerId, workerName: name })

    if (this.webhookTimeoutInMs > WEBHOOK_MAX_TIMEOUT) {
      this.webhookTimeoutInMs = WEBHOOK_MAX_TIMEOUT
    }
    this.workerName = name
    this.configure()
  }

  private configure(): void {
    this.root_workflow_queue.onMessage(async (messageId: string, wfId: WorkflowRefType) => {
      await this.handleMessage(messageId, wfId)
    })

    this.finished_workflow_queue.onMessage(async (messageId: string, wfId: WorkflowRefType) => {
      await this.handleCleanup(messageId, wfId)
    })
  }

  private async handleCleanup(messageId: string, wfId: WorkflowRefType): Promise<void> {
    try {
      this.logger.info(`Received cleanup-message. MessageId: ${messageId}, wfId: ${wfId}`)
      const result = await Promise.all([
        this.workflowStore.delete(wfId),
        this.runtimeStore.delete(wfId),
      ])
      this.logger.trace(JSON.stringify(result))
      await this.finished_workflow_queue.ack(messageId)
    } catch (error) {
      await this.finished_workflow_queue.nack(messageId, true)
      this.logger.error(`Worker cleanup-error: ${JSON.stringify(error)}`)
    }
  }

  private async handleMessage(messageId: string, wfId: WorkflowRefType): Promise<void> {
    try {
      this.logger.info(`Received workflow-message. MessageId: ${messageId}, wfId: ${wfId}`)

      const lock = await this.workflowStore.acquireLock(wfId, this.workerName)
      if (!lock) {
        this.logger.trace(`Could not acquire lock on workflow ${wfId}, nacking + requeue`)
        await this.root_workflow_queue.nack(messageId, true)
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

      const userData = await this.userStore.get(workflow.owner())
      const credits = BigInt(userData?.executionCredits ?? 0)
      const info = await workflow.clock(credits)
      this.logger.trace(`Clocked workflow: ${workflow.id()}`)
      this.logger.trace(JSON.stringify(info))

      if (info.status === 'waiting_for_input') {
        await this.handleWaitingForInput(workflow, wfId, messageId, info)
        return
      }

      if (info.status == 'insufficient_credit') {
        this.logger.debug(`User found with insufficient credits: ${workflow.owner()}`)
        const webhookUrl = workflow.webhookUrl()
        if (webhookUrl) {
          await this.sendWebhook(workflow.id(), {
            url: webhookUrl,
            eventType: 'insufficient_credit',
            payload: { wfId: workflow.id() },
            secret: this.webhookSecret,
            timeoutMs: this.webhookTimeoutInMs,
          })
        }
        return
      }

      if (info.status == 'finished' || info.status == 'terminated') {
        this.logger.error(
          `Finished / Terminated Workflow ${workflow.id()} being tried to clock. This should not occur`,
        )
        await this.finished_workflow_queue.enqueue(workflow.id(), this.workflowPreserveTimeInMs)
        return
      }

      if (info.status == 'error') {
        this.logger.debug(`Workflow ${workflow.id()} encountered error while execution`)
        this.logger.debug(
          `${workflow.id()} encountered error. Workflow will be cleanup in ${this.workflowPreserveTimeInMs} ms`,
        )
        await this.finished_workflow_queue.enqueue(workflow.id(), this.workflowPreserveTimeInMs)
        return
      }

      await this.handleInProgressWorkflow(workflow, wfId, messageId, info)
    } catch (error) {
      await this.root_workflow_queue.nack(messageId, true)
      this.logger.error(`Worker error: ${JSON.stringify(error)} during workflow: ${wfId}`)
    }
  }

  private async handleInProgressWorkflow(
    workflow: Workflow,
    wfId: WorkflowRefType,
    messageId: string,
    clockOkResult: ClockOk,
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
      this.userStore.adjustCredits(workflow.owner(), {
        executionCredits: -clockOkResult.executionInfo.creditsConsumed,
      }),
      this.root_workflow_queue.enqueue(wfId, this.workerClockTime),
      this.root_workflow_queue.ack(messageId),
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
      this.root_workflow_queue.ack(messageId),
    ])
    this.logger.trace(JSON.stringify(result2))

    const webhookUrl = workflow.webhookUrl()
    if (webhookUrl) {
      await this.sendWebhook(workflow.id(), {
        url: webhookUrl,
        eventType: 'awaiting-input',
        payload: { wfId: workflow.id(), info },
        secret: this.webhookSecret,
        timeoutMs: this.webhookTimeoutInMs,
      })
    }
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
        const enqResult = await this.root_workflow_queue.enqueue(element.id, element.executionDelay)
        this.logger.trace(enqResult)
      }
    }

    await this.root_workflow_queue.ack(messageId)
    await this.finished_workflow_queue.enqueue(workflow.id(), this.workflowPreserveTimeInMs)

    const webhookUrl = workflow.webhookUrl()
    if (webhookUrl) {
      await this.sendWebhook(workflow.id(), {
        url: webhookUrl,
        eventType: 'finished',
        payload: { wfId: workflow.id() },
        secret: this.webhookSecret,
        timeoutMs: this.webhookTimeoutInMs,
      })
    }
  }

  private async sendWebhook(
    wfId: string,
    params: {
      url: string
      eventType: string
      payload: unknown
      secret: string
      timeoutMs?: number
    },
  ): Promise<{ ok: boolean; status: number; ms: number; snippet?: string; error?: string }> {
    const { url, eventType, payload, secret, timeoutMs } = params

    const bodyObj = {
      id: crypto.randomUUID(),
      type: eventType,
      createdAt: new Date().toISOString(),
      data: payload,
    }

    const body = JSON.stringify(bodyObj)
    const ts = Math.floor(Date.now() / 1000).toString()
    const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

    const start = Date.now()
    try {
      const res = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'mini-math-webhooks/1.0',
          'X-Webhook-Timestamp': ts,
          'X-Webhook-Signature': `sha256=${sig}`,
        },
        timeout: timeoutMs ?? this.webhookTimeoutInMs,
        // prevent axios from throwing on non-2xx so you can treat it like fetch
        validateStatus: () => true,
        // keep response small
        maxContentLength: 1024 * 1024,
        maxBodyLength: 1024 * 1024,
        responseType: 'text',
      })

      this.logger.debug(`Workflow: ${wfId}: webhook triggered successfully`)
      const snippet =
        typeof res.data === 'string'
          ? res.data.slice(0, 1000)
          : JSON.stringify(res.data).slice(0, 1000)

      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        ms: Date.now() - start,
        snippet,
      }
    } catch (e) {
      const msg = String(e)
      this.logger.error(`Workflow: ${wfId}: webhook error: ${msg}`)
      return {
        ok: false,
        status: 0,
        ms: Date.now() - start,
        error: msg,
      }
    }
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
          if (typeof this.root_workflow_queue.close === 'function') {
            await this.root_workflow_queue.close()
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
