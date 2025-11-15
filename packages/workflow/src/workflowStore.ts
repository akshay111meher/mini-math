import { z } from 'zod'
import { WorkflowCore, type WorkflowDef } from './types.js'

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

/**
 * Throwing contract:
 * - create(): throw WorkflowStoreError('ALREADY_EXISTS') if id already present
 * - get():    throw WorkflowStoreError('NOT_FOUND') if id missing
 * - update(): throw WorkflowStoreError('NOT_FOUND') if id missing
 */
export abstract class WorkflowStore {
  /**
   * Create a new workflow with the given id from a core definition (no id inside).
   * MUST throw ALREADY_EXISTS if the id already exists.
   */
  public abstract create(
    workflowId: string,
    core: z.infer<typeof WorkflowCore>,
    owner: string,
  ): Promise<WorkflowDef>

  /**
   * Get the full workflow definition by id.
   * MUST throw NOT_FOUND if it does not exist.
   */
  public abstract get(workflowId: string): Promise<WorkflowDef>

  /**
   * Patch/merge the workflow by id.
   * MUST throw NOT_FOUND if it does not exist.
   */
  public abstract update(workflowId: string, patch: Partial<WorkflowDef>): Promise<WorkflowDef>

  // ---- Useful platform helpers ----

  /** True if a workflow with this id exists. */
  public abstract exists(workflowId: string): Promise<boolean>

  /** Hard delete by id (no-op if missing is acceptable, or throw NOT_FOUND — your choice in impl docs). */
  public abstract delete(workflowId: string): Promise<void>

  /** List workflows (paged). */
  public abstract list(options?: ListOptions): Promise<ListResult>

  /** Replace the whole workflow definition (id must match key). */
  public abstract replace(workflowId: string, def: WorkflowDef): Promise<WorkflowDef>
}
