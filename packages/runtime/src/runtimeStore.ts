// runtimeStore.ts
import type { RuntimeDef } from './runtime.js'

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

export interface ListOptions {
  cursor?: string
  limit?: number
}

export interface ListResult {
  items: RuntimeDef[]
  nextCursor?: string
}

/**
 * Throwing contract:
 * - create(): throw ALREADY_EXISTS if id already present
 * - get():    throw NOT_FOUND if id missing
 * - update(): throw NOT_FOUND if id missing
 */
export abstract class RuntimeStore {
  /** Create a new runtime for workflowId (optionally from initial). */
  public abstract create(
    workflowId: string,
    initial?: Partial<RuntimeDef>,
  ): Promise<import('./runtime.js').Runtime>

  /** Get the runtime instance for workflowId. */
  public abstract get(workflowId: string): Promise<import('./runtime.js').Runtime>

  /** Merge/patch the runtime state for workflowId. */
  public abstract update(
    workflowId: string,
    patch: Partial<RuntimeDef>,
  ): Promise<import('./runtime.js').Runtime>

  // ---- Platform helpers ----

  /** True if a runtime exists for workflowId. */
  public abstract exists(workflowId: string): Promise<boolean>

  /** Hard delete runtime. (No-op if missing or throw NOT_FOUND—document in impl.) */
  public abstract delete(workflowId: string): Promise<void>

  /** Replace the whole runtime state with a new def. */
  public abstract replace(
    workflowId: string,
    def: RuntimeDef,
  ): Promise<import('./runtime.js').Runtime>

  /** Return a serialized snapshot (data only). */
  public abstract snapshot(workflowId: string): Promise<RuntimeDef>

  /** List runtime snapshots (paged). */
  public abstract list(options?: ListOptions): Promise<ListResult>

  /**
   * Seed queue with `entry` if queue/visited are empty and not finished.
   * Returns the updated runtime.
   */
  public abstract seedIfEmpty(
    workflowId: string,
    entry: string,
  ): Promise<import('./runtime.js').Runtime>
}
