import { ActivityRecord, Checkpoint, StateStore } from '@mini-math/runtime'
import { NodeId, RunId } from '@mini-math/workflow'

export interface PostgresOptions {
  connectionString?: string
  pool?: unknown // pg.Pool-like
}

export abstract class PostgresStateStoreBase implements StateStore {
  protected readonly opts: PostgresOptions
  constructor(opts: PostgresOptions) {
    this.opts = opts
  }
  abstract saveCheckpoint(cp: Checkpoint): Promise<void>
  abstract loadCheckpoint(runId: RunId): Promise<Checkpoint | undefined>
  abstract appendActivity(rec: ActivityRecord): Promise<void>
  abstract getActivity(
    runId: RunId,
    nodeId: NodeId,
    attempt: number,
  ): Promise<ActivityRecord | undefined>
}
