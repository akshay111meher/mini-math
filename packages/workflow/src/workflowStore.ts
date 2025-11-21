import { LockType, WorkflowCoreType, type WorkflowDef } from './types.js'

export type WorkflowStoreErrorCode =
  | 'ALREADY_EXISTS'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'UNKNOWN'

export class WorkflowStoreError extends Error {
  constructor(
    public readonly code: WorkflowStoreErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'WorkflowStoreError'
  }
}

export interface ListOptions {
  cursor?: string
  limit?: number
}

export interface ListResult {
  items: WorkflowDef[]
  nextCursor?: string
}

export abstract class WorkflowStore {
  private initialized = false

  /** Called exactly once before any operation. */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  // -------------------------------------------------------------------------
  // PUBLIC API — always calls ensureInitialized(), then delegates to internal
  // -------------------------------------------------------------------------

  public async create(
    workflowId: string,
    core: WorkflowCoreType,
    owner: string,
  ): Promise<WorkflowDef> {
    await this.ensureInitialized()
    return this._create(workflowId, core, owner)
  }

  public async get(workflowId: string): Promise<WorkflowDef> {
    await this.ensureInitialized()
    return this._get(workflowId)
  }

  public async update(workflowId: string, patch: Partial<WorkflowDef>): Promise<WorkflowDef> {
    await this.ensureInitialized()
    return this._update(workflowId, patch)
  }

  public async exists(workflowId: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._exists(workflowId)
  }

  public async delete(workflowId: string): Promise<void> {
    await this.ensureInitialized()
    return this._delete(workflowId)
  }

  public async list(options?: ListOptions): Promise<ListResult> {
    await this.ensureInitialized()
    return this._list(options)
  }

  public async replace(workflowId: string, def: WorkflowDef): Promise<WorkflowDef> {
    await this.ensureInitialized()
    return this._replace(workflowId, def)
  }

  public async lockedBy(workflowId: string): Promise<string | undefined> {
    await this.ensureInitialized()
    const wf = await this._get(workflowId)

    return wf.lock?.lockedBy
  }
  public async isLocked(workflowId: string, entity: string): Promise<boolean> {
    await this.ensureInitialized()
    const wf = await this._get(workflowId)
    const lock = wf.lock
    if (lock) {
      if (lock.lockedBy == entity) {
        return true
      }
      return false
    }
    return false
  }

  public async acquireLock(workflowId: string, entity: string): Promise<boolean> {
    await this.ensureInitialized()
    const isLocked = await this.isLocked(workflowId, entity)
    if (isLocked) {
      return false
    }
    return await this._lock(workflowId, entity)
  }

  public async releaseLock(workflowId: string): Promise<boolean> {
    await this.ensureInitialized()
    return await this._unlock(workflowId)
  }

  protected async _lock(workflowId: string, entity: string): Promise<boolean> {
    const lock: LockType = { lockedBy: entity, lockedAt: new Date().valueOf() }
    await this._update(workflowId, { lock })
    return true
  }

  protected async _unlock(workflowId: string): Promise<boolean> {
    await this._update(workflowId, { lock: undefined })
    return true
  }

  // -------------------------------------------------------------------------
  // INTERNAL API — must be implemented by concrete stores
  // -------------------------------------------------------------------------

  /** Implementors may override if they have async init work. */
  protected abstract initialize(): Promise<void>

  protected abstract _create(
    workflowId: string,
    core: WorkflowCoreType,
    owner: string,
  ): Promise<WorkflowDef>

  protected abstract _get(workflowId: string): Promise<WorkflowDef>

  protected abstract _update(workflowId: string, patch: Partial<WorkflowDef>): Promise<WorkflowDef>

  protected abstract _exists(workflowId: string): Promise<boolean>

  protected abstract _delete(workflowId: string): Promise<void>

  protected abstract _list(options?: ListOptions): Promise<ListResult>

  protected abstract _replace(workflowId: string, def: WorkflowDef): Promise<WorkflowDef>
}
