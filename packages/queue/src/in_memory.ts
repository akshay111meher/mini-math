import { IQueue } from './types.js'
import { makeLogger } from '@mini-math/logger'

const logger = makeLogger('InMemoryQueue')

// In-memory implementation (for tests / local runs)
export class InMemoryQueue<T> implements IQueue<T> {
  private queue: Array<{ messageId: string; item: T }> = []
  private inFlight: Map<string, { messageId: string; item: T }> = new Map()
  private callback?: (messageId: string, item: T) => Promise<void>
  private closed = false
  private processing = false // simulate prefetch(1)

  async enqueue(item: T): Promise<string> {
    this.ensureOpen()
    const messageId = this.generateId()
    this.queue.push({ messageId, item })
    // Try to deliver immediately if we have a consumer
    this.kick()
    return messageId
  }

  onMessage(callback: (messageId: string, item: T) => Promise<void>): void {
    this.callback = callback
    // Start a delivery attempt when a consumer subscribes
    this.kick()
  }

  ack(messageId: string): void {
    if (this.inFlight.has(messageId)) {
      this.inFlight.delete(messageId)
      // After ack, try delivering the next message
      this.kick()
    }
  }

  nack(messageId: string, requeue: boolean): void {
    const entry = this.inFlight.get(messageId)
    if (entry) {
      this.inFlight.delete(messageId)
      if (requeue) {
        // Requeue to the tail like many brokers do by default
        this.queue.push(entry)
      }
      this.kick()
    }
  }

  async size(): Promise<number> {
    return this.queue.length + this.inFlight.size
  }

  async close(): Promise<void> {
    this.closed = true
    this.callback = undefined
    this.queue = []
    this.inFlight.clear()
  }

  async clear(): Promise<void> {
    this.queue = []
    this.inFlight.clear()
  }

  // --- internals ---
  private ensureOpen() {
    if (this.closed) throw new Error('InMemoryQueue is closed')
  }

  private kick() {
    if (this.processing) return
    if (!this.callback) return
    if (this.inFlight.size >= 1) return // simulate prefetch(1)
    if (this.queue.length === 0) return

    const next = this.queue.shift()!
    this.inFlight.set(next.messageId, next)

    this.processing = true
    // Deliver asynchronously to mimic broker behavior
    Promise.resolve()
      .then(() => this.callback!(next.messageId, next.item))
      .catch((err) => {
        // If the consumer throws, consider it a reject without requeue
        this.inFlight.delete(next.messageId)
        logger.error('[InMemoryQueue] Consumer error:', err?.message || err)
      })
      .finally(() => {
        this.processing = false
        // Do not auto-ack. Wait for explicit ack/nack.
        // But we can attempt to deliver the next one if inFlight is free (i.e., after ack/nack).
      })
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  }
  static async create<T>(): Promise<InMemoryQueue<T>> {
    return new InMemoryQueue<T>()
  }
}
