// RabbitMQ implementation
import * as amqp from 'amqplib'
import { InternalMessage, IQueue } from '@mini-math/queue'
import { Logger, makeLogger } from '@mini-math/logger'

export class RabbitMQQueue<T> implements IQueue<T> {
  private connection: amqp.ChannelModel | undefined
  private channel: amqp.Channel | undefined
  private queueName: string
  private connectionUrl: string
  private inFlight: Map<string, amqp.Message> = new Map()
  private messageCallback?: (messageId: string, item: T) => Promise<void>
  private consumerTag?: string
  private isReconnecting = false
  private explicitClose = false
  private logger: Logger

  private initialized = false
  private initPromise: Promise<void> | null = null

  constructor(connectionUrl: string, queueName: string) {
    this.connectionUrl = connectionUrl
    this.queueName = queueName
    this.logger = makeLogger('RabbitMq')
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return
    if (!this.initPromise) {
      this.initPromise = this.connect()
    }
    await this.initPromise
  }

  private async connect(): Promise<void> {
    if (this.connection) return // Already connected
    this.explicitClose = false
    this.logger.info(`[RabbitMQ] Connecting to ${this.connectionUrl}...`)

    try {
      this.connection = await amqp.connect(this.connectionUrl)

      this.connection.on('close', () => {
        if (!this.explicitClose) {
          this.handleDisconnect()
        }
      })

      this.connection.on('error', (err) => {
        this.logger.error('[RabbitMQ] Connection error:', err.message)
      })

      this.channel = await this.connection.createChannel()
      await this.channel.assertQueue(this.queueName, { durable: true })
      await this.channel.prefetch(1) // Process one message at a time per consumer

      this.logger.info(`[RabbitMQ] Connected and queue '${this.queueName}' asserted.`)

      if (this.messageCallback) {
        await this.setupConsumer()
      }
    } catch (error) {
      this.logger.error('[RabbitMQ] Failed to connect')
      this.logger.error(JSON.stringify(error))
      this.handleDisconnect()
    }
  }

  private handleDisconnect() {
    if (this.isReconnecting) return

    this.isReconnecting = true
    this.connection = undefined
    this.channel = undefined
    this.consumerTag = undefined

    this.logger.warn('[RabbitMQ] Connection lost. Attempting to reconnect in 5 seconds...')

    setTimeout(() => {
      this.isReconnecting = false
      this.connect().catch((err) => {
        this.logger.error('[RabbitMQ] Reconnect failed:', err.message)
        // It will try to reconnect again on next call that requires connection.
      })
    }, 5000)
  }

  async enqueue(item: T): Promise<string> {
    await this.ensureInitialized()
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available. Message not enqueued.')
    }
    const messageId = this.generateId()
    const message: InternalMessage<T> = { messageId, item }
    const buffer = Buffer.from(JSON.stringify(message))

    await this.channel.sendToQueue(this.queueName, buffer, {
      persistent: true,
      messageId,
    })

    return messageId
  }

  onMessage(callback: (messageId: string, item: T) => Promise<void>): void {
    this.messageCallback = callback
    if (this.channel) {
      this.setupConsumer()
    }
  }

  private async setupConsumer(): Promise<void> {
    if (!this.channel || !this.messageCallback) return

    // If there's an old consumer tag, we don't need to do anything.
    // The 'close' event on the channel/connection should handle cleanup.
    // When we reconnect, we'll get a new channel and set up a new consumer.

    const consumerTag = `consumer_${this.queueName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      const consumeResult = await this.channel.consume(
        this.queueName,
        async (msg: amqp.ConsumeMessage | null) => {
          if (!msg) return

          try {
            const content: InternalMessage<T> = JSON.parse(msg.content.toString())
            const { messageId, item } = content
            this.inFlight.set(messageId, msg)
            if (this.messageCallback) {
              await this.messageCallback(messageId, item)
            }
          } catch (error) {
            this.logger.error('Error processing message:')
            this.logger.error(JSON.stringify(error))
            this.channel?.nack(msg, false, false)
          }
        },
        {
          noAck: false,
          consumerTag,
        },
      )
      this.consumerTag = consumeResult.consumerTag
      this.logger.info(`Consumer ${this.consumerTag} registered for queue ${this.queueName}`)
    } catch (error) {
      this.logger.error(`[RabbitMQ] Failed to set up consumer for queue ${this.queueName}`)
      this.logger.error(JSON.stringify(error))
    }
  }

  ack(messageId: string): void {
    const msg = this.inFlight.get(messageId)
    if (msg && this.channel) {
      this.channel.ack(msg)
      this.inFlight.delete(messageId)
    }
  }

  nack(messageId: string, requeue: boolean): void {
    const msg = this.inFlight.get(messageId)
    if (msg && this.channel) {
      this.channel.nack(msg, false, requeue)
      this.inFlight.delete(messageId)
    }
  }

  async size(): Promise<number> {
    await this.ensureInitialized()
    try {
      if (!this.channel) {
        return this.inFlight.size
      }
      const queueInfo = await this.channel.checkQueue(this.queueName)
      return queueInfo.messageCount + this.inFlight.size
    } catch (error) {
      this.logger.warn('[RabbitMQ] Could not get queue size, channel might be closed.')
      this.logger.error(JSON.stringify(error))
      return this.inFlight.size
    }
  }

  async close(): Promise<void> {
    this.explicitClose = true
    if (this.consumerTag && this.channel) {
      try {
        await this.channel.cancel(this.consumerTag)
      } catch (error) {
        this.logger.error(`[RabbitMQ] Failed to cancel consumer ${this.consumerTag}`)
        this.logger.error(JSON.stringify(error))
      }
    }
    try {
      if (this.channel) await this.channel.close()
      if (this.connection) await this.connection.close()
    } catch (error) {
      this.logger.error('[RabbitMQ] Error during close:')
      this.logger.error(JSON.stringify(error))
    } finally {
      this.channel = undefined
      this.connection = undefined
    }
  }

  async clear(): Promise<void> {
    await this.ensureInitialized()
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available.')
    }
    await this.channel.purgeQueue(this.queueName)
    this.inFlight.clear()
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }
}
