import { Frame } from '@mini-math/compiler'
import { NodeRegistry } from '@mini-math/workflow'
import { StateStore } from './state.js'
import { MetricsSink } from './metrics.js'

export type RunOutcome =
  | { kind: 'Yield'; frame: Frame }
  | { kind: 'Done' }
  | { kind: 'Fault'; error: Error; frame?: Frame }

export interface Syscalls {
  registry: NodeRegistry
  metrics: MetricsSink
  state: StateStore
  nowMs(): number
}

export abstract class VMBase {
  protected readonly sys: Syscalls
  constructor(sys: Syscalls) {
    this.sys = sys
  }
  abstract run(frame: Frame): Promise<RunOutcome>
}
