import { IQueue } from './types.js'
import { makeLogger } from '@mini-math/logger'

type Item<T> = { messageId: string; item: T }
type Consumer<T> = {
  id: string
  fn: (messageId: string, item: T) => Promise<void>
  busy: boolean
}

export class InMemoryQueue<T> implements IQueue<T> {
  private readonly logger = makeLogger('InMemoryQueue')

  private queue: Array<Item<T>> = []
  private inFlight = new Map<string, Item<T>>()
  private consumers: Array<Consumer<T>> = []
  private byMessageConsumer = new Map<string, string>() // msgId -> consumerId
  private closed = false
  private rrIndex = 0 // round-robin pointer
  private kicking = false // prevent re-entrant kick storms

  async init(): Promise<void> {
    return
  }

  async enqueue(item: T, delayMs: number = 0): Promise<string> {
    this.ensureOpen()
    const messageId = this.generateId()

    if (delayMs <= 0) {
      // immediate enqueue (what you already had)
      this.queue.push({ messageId, item })
      this.logger.trace(`enqueue -> queued=${this.queue.length} inflight=${this.inFlight.size}`, {
        messageId,
      })
      queueMicrotask(() => this.kick())
    } else {
      // delayed enqueue
      this.logger.trace(
        `enqueue(delayed) -> delayMs=${delayMs} queued=${this.queue.length} inflight=${this.inFlight.size}`,
        { messageId },
      )

      setTimeout(() => {
        // when the delay expires, *then* push to the real queue
        try {
          this.ensureOpen()
        } catch {
          // queue was closed in the meantime; just drop it
          this.logger.warn(`dropping delayed message because queue is closed`, { messageId })
          return
        }

        this.queue.push({ messageId, item })
        this.logger.trace(
          `delayed visible -> queued=${this.queue.length} inflight=${this.inFlight.size}`,
          { messageId },
        )

        queueMicrotask(() => this.kick())
      }, delayMs)
    }

    return messageId
  }

  onMessage(callback: (messageId: string, item: T) => Promise<void>): void {
    this.ensureOpen()
    const id = this.generateId()
    this.consumers.push({ id, fn: callback, busy: false })
    this.logger.debug(`consumer_added`, { consumerId: id, total: this.consumers.length })
    queueMicrotask(() => this.kick())
  }

  ack(messageId: string): void {
    if (!this.inFlight.has(messageId)) return
    this.inFlight.delete(messageId)
    const cid = this.byMessageConsumer.get(messageId)
    if (cid) this.byMessageConsumer.delete(messageId)
    this.logger.trace(`ack`, { messageId, queued: this.queue.length, inflight: this.inFlight.size })
    queueMicrotask(() => this.kick())
  }

  nack(messageId: string, requeue: boolean): void {
    const entry = this.inFlight.get(messageId)
    if (!entry) return
    this.inFlight.delete(messageId)
    const cid = this.byMessageConsumer.get(messageId)
    if (cid) this.byMessageConsumer.delete(messageId)
    if (requeue) {
      // push a fresh copy
      this.queue.push({ messageId: entry.messageId, item: entry.item })
      this.logger.debug(`nack -> requeued`, { messageId })
    } else {
      this.logger.debug(`nack -> dropped`, { messageId })
    }
    queueMicrotask(() => this.kick())
  }

  async size(): Promise<number> {
    return this.queue.length + this.inFlight.size
  }

  async purge(): Promise<void> {
    this.queue = []
    this.inFlight.clear()
    this.byMessageConsumer.clear()
    this.logger.warn(`purged`)
  }

  async close(): Promise<void> {
    this.closed = true
    this.queue = []
    this.inFlight.clear()
    this.byMessageConsumer.clear()
    this.consumers = []
    this.logger.info(`closed`)
  }

  async clear(): Promise<void> {
    this.queue = []
    this.inFlight.clear()
    this.byMessageConsumer.clear()
    this.logger.info(`cleared`)
  }

  // ---- internals ----

  private ensureOpen() {
    if (this.closed) throw new Error('InMemoryQueue is closed')
  }

  private kick() {
    if (this.kicking) return
    this.kicking = true

    try {
      while (true) {
        if (this.queue.length === 0) break
        const consumer = this.nextAvailableConsumer()
        if (!consumer) break

        const next = this.queue.shift()!
        this.inFlight.set(next.messageId, next)
        this.byMessageConsumer.set(next.messageId, consumer.id)
        consumer.busy = true

        this.logger.trace(`dispatch`, {
          to: consumer.id,
          messageId: next.messageId,
          queued: this.queue.length,
          inflight: this.inFlight.size,
        })

        // deliver asynchronously; when it unwinds, free the consumer and kick again
        Promise.resolve(consumer.fn(next.messageId, next.item))
          .catch((err) => {
            // if consumer throws, requeue the message (common default) and log
            if (this.inFlight.has(next.messageId)) {
              this.inFlight.delete(next.messageId)
              this.byMessageConsumer.delete(next.messageId)
              this.queue.push({ messageId: next.messageId, item: next.item })
              this.logger.error(`consumer_error -> requeued`, {
                messageId: next.messageId,
                error: err?.message ?? String(err),
              })
            }
          })
          .finally(() => {
            consumer.busy = false
            // schedule a future pump; don’t inline to avoid re-entrancy issues
            queueMicrotask(() => this.kick())
          })
      }
    } finally {
      this.kicking = false
    }
  }

  private nextAvailableConsumer(): Consumer<T> | null {
    if (this.consumers.length === 0) return null

    // round-robin search for a non-busy consumer
    const n = this.consumers.length
    for (let i = 0; i < n; i++) {
      const idx = (this.rrIndex + i) % n
      const c = this.consumers[idx]
      if (!c.busy) {
        this.rrIndex = (idx + 1) % n
        return c
      }
    }
    return null
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  }

  static async create<T>(): Promise<InMemoryQueue<T>> {
    return new InMemoryQueue<T>()
  }
}
