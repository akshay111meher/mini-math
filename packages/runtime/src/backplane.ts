import { Frame } from '@mini-math/compiler'
import { RunId } from '@mini-math/workflow'

export interface FrameMsg {
  kind: 'Frame'
  runId: RunId
  frame: Frame
  priority?: number
}

export interface Subscription {
  unsubscribe(): void
}

export interface Backplane {
  publish(msg: FrameMsg): Promise<void> // enqueue a frame
  subscribe(
    group: string,
    onMsg: (msg: FrameMsg, ack: () => Promise<void>) => void,
  ): Promise<Subscription>
}
