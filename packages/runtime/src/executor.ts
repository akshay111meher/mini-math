import { Backplane } from './backplane.js'
import { Syscalls } from './vm.js'

export interface ExecutorConfig {
  id: string
  backplane: Backplane
  sys: Syscalls
  group?: string // queue group for competing consumers
  pollMs?: number // idle poll delay for no-op loops
}

export abstract class ExecutorBase {
  protected readonly cfg: ExecutorConfig
  constructor(cfg: ExecutorConfig) {
    this.cfg = cfg
  }
  abstract start(): Promise<void>
  abstract stop(): Promise<void>
}
