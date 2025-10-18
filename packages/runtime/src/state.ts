import { Json, NodeId, RunId } from '@mini-math/workflow'
import { Frame } from '@mini-math/compiler'

export interface Checkpoint {
  runId: RunId
  frame: Frame // serialized snapshot
  atMs: number
}

export interface ActivityRecord {
  runId: RunId
  nodeId: NodeId
  attempt: number
  startedAtMs: number
  endedAtMs: number
  output: Json // recorded for deterministic replay
}

export interface StateStore {
  saveCheckpoint(cp: Checkpoint): Promise<void>
  loadCheckpoint(runId: RunId): Promise<Checkpoint | undefined>
  appendActivity(rec: ActivityRecord): Promise<void>
  getActivity(runId: RunId, nodeId: NodeId, attempt: number): Promise<ActivityRecord | undefined>
}
