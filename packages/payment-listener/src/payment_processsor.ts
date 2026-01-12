import { RabbitMQQueue } from '@mini-math/adapters'
import { PaymentMessage } from './payment_listener.js'
import { Logger, makeLogger } from '@mini-math/logger'

export class PaymentProcessor {
  private logger: Logger
  constructor(private queue: RabbitMQQueue<PaymentMessage>) {
    this.logger = makeLogger('PaymentProcessor')
    this.configure()
  }

  private configure(): void {
    this.queue.onMessage(async (messageId: string, paymentMessage: PaymentMessage) => {
      await this.handleMessage(messageId, paymentMessage)
    })
  }

  private async handleMessage(messageId: string, paymentMessage: PaymentMessage): Promise<void> {
    try {
      this.logger.info(
        `Received payment-message. MessageId: ${messageId}, Payment: ${JSON.stringify(paymentMessage)}`,
      )
      await this.queue.nack(messageId, true)
    } catch (ex) {
      this.logger.error('Error', { ex })
      await this.queue.nack(messageId, true)
    }
  }

  public async start(): Promise<void> {
    this.logger.info('Started')

    // 2. Keep process alive, exit on Ctrl+C / SIGTERM
    await new Promise<void>((resolve) => {
      // big interval just to hold an active handle
      const keepAlive = setInterval(() => {
        // no-op
      }, 1_000_000)

      const shutdown = async (signal: NodeJS.Signals) => {
        this.logger.info(`Received ${signal}. Shutting down payment processor...`)
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

    this.logger.error('payment processor stopped')
  }
}
