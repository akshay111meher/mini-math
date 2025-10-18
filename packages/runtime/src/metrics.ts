import { NodeType, NodeId, RunId } from '@mini-math/workflow'

export interface NodeRuntimeSample {
  nodeId: NodeId
  nodeType: NodeType
  runId: RunId
  tMs: number // wall time
  cpuMs?: number // optional CPU time
  memMb?: number // RSS/high-water estimate
  startedAtMs: number
  endedAtMs: number
  attempts: number
}

export interface MetricsSink {
  recordNode(sample: NodeRuntimeSample): void
  recordRun(runId: RunId, status: 'started' | 'completed' | 'failed'): void
}
