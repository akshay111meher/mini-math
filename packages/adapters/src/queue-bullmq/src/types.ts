import { Backplane, FrameMsg, Subscription } from '@mini-math/runtime'

export interface BullMqOptions {
  name?: string // queue name
  connection: unknown // ioredis connection options
  defaultJobOpts?: unknown // pass-through to BullMQ
}

export abstract class BullMqBackplaneBase implements Backplane {
  protected readonly opts: BullMqOptions
  constructor(opts: BullMqOptions) {
    this.opts = opts
  }
  abstract publish(msg: FrameMsg): Promise<void>
  abstract subscribe(
    group: string,
    onMsg: (msg: FrameMsg, ack: () => Promise<void>) => void,
  ): Promise<Subscription>
}
