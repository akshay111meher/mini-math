import { CostHint, Json, NodeSpec, NodeType } from '@mini-math/workflow'

export interface JSNodeConfig<I = Json, O = Json> {
  type: NodeType // e.g., 'js.eval.v1'
  code: string // user function source
  deterministic?: boolean // default true
  timeoutMs?: number // default 2000
  memoryMb?: number // default 64
  estimate?: (shape: I) => CostHint
}

export abstract class ScriptSandbox {
  abstract run<I, O>(
    code: string,
    input: I,
    options: {
      timeoutMs?: number
      memoryMb?: number
      seed?: string | number
      allowNetwork?: boolean
    },
  ): Promise<O>
}

export abstract class ScriptNodeFactory {
  abstract create<I, O>(cfg: JSNodeConfig<I, O>): NodeSpec<I, O>
}
