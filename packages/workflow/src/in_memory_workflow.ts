import { ZodError } from 'zod'
import {
  NextLinkedWorkflowType,
  WorkflowCore,
  WorkflowCoreType,
  WorkflowRefType,
  WorkflowSchema,
  type WorkflowDef,
} from './types.js'
import { WorkflowStore, WorkflowStoreError, type WorkflowStoreErrorCode } from './workflowStore.js'
import { deepClone, ListOptions, ListResult } from '@mini-math/utils'

export class InMemoryWorkflowStore extends WorkflowStore {
  private readonly store = new Map<string, WorkflowDef>()

  public override async _create(
    workflowId: string,
    core: WorkflowCoreType,
    owner: string,
    options?: {
      previousLinkedWorkflow?: WorkflowRefType
      nextLinkedWorkflow?: NextLinkedWorkflowType
    },
  ): Promise<WorkflowDef> {
    if (!workflowId) throw new WorkflowStoreError('VALIDATION', 'workflowId is required')

    if (this.store.has(workflowId)) {
      throw new WorkflowStoreError('ALREADY_EXISTS', `workflow "${workflowId}" already exists`)
    }

    try {
      const parsedCore = WorkflowCore.parse(core)
      const full = WorkflowSchema.parse({ ...parsedCore, id: workflowId, owner, ...options })
      this.store.set(workflowId, full)
      return deepClone(full)
    } catch (err) {
      throw this.asStoreError(err, 'VALIDATION', 'Failed to create workflow')
    }
  }

  protected async initialize(): Promise<void> {
    return
  }

  public async _get(workflowId: string): Promise<WorkflowDef> {
    if (!workflowId) throw new WorkflowStoreError('VALIDATION', 'workflowId is required')

    const existing = this.store.get(workflowId)
    if (!existing) {
      throw new WorkflowStoreError('NOT_FOUND', `workflow "${workflowId}" not found`)
    }
    return deepClone(existing)
  }

  public async _update(workflowId: string, patch: Partial<WorkflowDef>): Promise<WorkflowDef> {
    if (!workflowId) throw new WorkflowStoreError('VALIDATION', 'workflowId is required')

    const existing = this.store.get(workflowId)
    if (!existing) {
      throw new WorkflowStoreError('NOT_FOUND', `workflow "${workflowId}" not found`)
    }

    try {
      // Keep id authoritative from the key
      const merged = WorkflowSchema.parse({ ...existing, ...patch, id: workflowId })
      this.store.set(workflowId, merged)
      return deepClone(merged)
    } catch (err) {
      throw this.asStoreError(err, 'VALIDATION', 'Failed to update workflow')
    }
  }

  public async _exists(workflowId: string): Promise<boolean> {
    return this.store.has(workflowId)
  }

  // No-op if missing (can change to throw NOT_FOUND if you prefer)
  public async _delete(workflowId: string): Promise<void> {
    this.store.delete(workflowId)
  }

  public async _list(owner: string, options?: ListOptions): Promise<ListResult<WorkflowDef>> {
    if (!owner) throw new WorkflowStoreError('VALIDATION', 'owner is required')

    const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))

    const all = Array.from(this.store.values())
      .filter((w) => w.owner === owner)
      .sort((a, b) => a.id.localeCompare(b.id))

    let start = 0
    if (options?.cursor) {
      const idx = all.findIndex((w) => w.id === options.cursor)
      start = idx >= 0 ? idx + 1 : 0
    }

    const slice = all.slice(start, start + limit)
    const last = slice[slice.length - 1]
    const nextCursor = start + limit < all.length ? last?.id : undefined

    return {
      items: deepClone(slice),
      nextCursor,
    }
  }

  public async _replace(workflowId: string, def: WorkflowDef): Promise<WorkflowDef> {
    if (!workflowId) throw new WorkflowStoreError('VALIDATION', 'workflowId is required')
    if (def.id !== workflowId) {
      throw new WorkflowStoreError('CONFLICT', 'id in payload does not match workflowId')
    }

    try {
      const parsed = WorkflowSchema.parse(def)
      this.store.set(workflowId, parsed)
      return deepClone(parsed)
    } catch (err) {
      throw this.asStoreError(err, 'VALIDATION', 'Failed to replace workflow')
    }
  }

  private asStoreError(
    err: unknown,
    fallbackCode: WorkflowStoreErrorCode,
    msg: string,
  ): WorkflowStoreError {
    if (err instanceof WorkflowStoreError) return err
    if (err instanceof ZodError) {
      return new WorkflowStoreError('VALIDATION', msg, err.issues)
    }
    const text = err instanceof Error ? err.message : String(err)
    return new WorkflowStoreError(fallbackCode ?? 'UNKNOWN', `${msg}: ${text}`, err)
  }
}
