// Queue interface supporting callback-based strategy
export interface IQueue<T> {
  /**
   * Initialize the queue connection / resources.
   * Safe to call multiple times; initialization will only run once.
   */
  init(): Promise<void>

  /**
   * Enqueue an item into the queue.
   * Returns a unique message ID for tracking.
   */
  enqueue(item: T): Promise<string>

  /**
   * Set up a callback to be triggered when new messages arrive.
   */
  onMessage(callback: (messageId: string, item: T) => Promise<void>): void

  /**
   * Acknowledge successful processing of a message.
   * This removes the message from the queue permanently.
   */
  ack(messageId: string): void

  /**
   * Reject a message and optionally requeue it.
   * @param messageId The message to reject
   * @param requeue Whether to put the message back in the queue
   */
  nack(messageId: string, requeue: boolean): void

  /**
   * Get the approximate number of messages in the queue.
   */
  size(): Promise<number>

  /**
   * Close the queue connection.
   */
  close(): Promise<void>

  /**
   * Clear all messages from the queue.
   */
  clear(): Promise<void>
}

export interface InternalMessage<T> {
  messageId: string
  item: T
}
