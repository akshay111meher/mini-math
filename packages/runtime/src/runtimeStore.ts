// runtimeStore.ts
import { ListOptions, ListResult } from '@mini-math/utils'
import type { RuntimeDef, Runtime } from './runtime.js'

export type RuntimeStoreErrorCode =
  | 'ALREADY_EXISTS'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'UNKNOWN'

export class RuntimeStoreError extends Error {
  constructor(
    public readonly code: RuntimeStoreErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'RuntimeStoreError'
  }
}

/**
 * Throwing contract:
 * - create(): throw ALREADY_EXISTS if id already present
 * - get():    throw NOT_FOUND if id missing
 * - update(): throw NOT_FOUND if id missing
 */
export abstract class RuntimeStore {
  private initialized = false

  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — always calls ensureInitialized() then delegates to internals
  // ---------------------------------------------------------------------------

  /** Create a new runtime for workflowId (optionally from initial). */
  public async create(workflowId: string, initial?: Partial<RuntimeDef>): Promise<Runtime> {
    await this.ensureInitialized()
    return this._create(workflowId, initial)
  }

  /** Get the runtime instance for workflowId. */
  public async get(workflowId: string): Promise<Runtime> {
    await this.ensureInitialized()
    return this._get(workflowId)
  }

  /** Merge/patch the runtime state for workflowId. */
  public async update(workflowId: string, patch: Partial<RuntimeDef>): Promise<Runtime> {
    await this.ensureInitialized()
    return this._update(workflowId, patch)
  }

  /** True if a runtime exists for workflowId. */
  public async exists(workflowId: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._exists(workflowId)
  }

  /** Hard delete runtime. (No-op if missing or throw NOT_FOUND—document in impl.) */
  public async delete(workflowId: string): Promise<void> {
    await this.ensureInitialized()
    return this._delete(workflowId)
  }

  /** Replace the whole runtime state with a new def. */
  public async replace(workflowId: string, def: RuntimeDef): Promise<Runtime> {
    await this.ensureInitialized()
    return this._replace(workflowId, def)
  }

  /** Return a serialized snapshot (data only). */
  public async snapshot(workflowId: string): Promise<RuntimeDef> {
    await this.ensureInitialized()
    return this._snapshot(workflowId)
  }

  /** List runtime snapshots (paged). */
  public async list(options?: ListOptions): Promise<ListResult<RuntimeDef>> {
    await this.ensureInitialized()
    return this._list(options)
  }

  /**
   * Seed queue with `entry` if queue/visited are empty and not finished.
   * Returns the updated runtime.
   */
  public async seedIfEmpty(workflowId: string, entry: string): Promise<Runtime> {
    await this.ensureInitialized()
    return this._seedIfEmpty(workflowId, entry)
  }

  // ---------------------------------------------------------------------------
  // INTERNAL API — concrete stores implement only these
  // ---------------------------------------------------------------------------

  protected abstract initialize(): Promise<void>

  protected abstract _create(workflowId: string, initial?: Partial<RuntimeDef>): Promise<Runtime>

  protected abstract _get(workflowId: string): Promise<Runtime>

  protected abstract _update(workflowId: string, patch: Partial<RuntimeDef>): Promise<Runtime>

  protected abstract _exists(workflowId: string): Promise<boolean>

  protected abstract _delete(workflowId: string): Promise<void>

  protected abstract _replace(workflowId: string, def: RuntimeDef): Promise<Runtime>

  protected abstract _snapshot(workflowId: string): Promise<RuntimeDef>

  protected abstract _list(options?: ListOptions): Promise<ListResult<RuntimeDef>>

  protected abstract _seedIfEmpty(workflowId: string, entry: string): Promise<Runtime>
}
