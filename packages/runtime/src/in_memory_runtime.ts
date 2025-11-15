// inMemoryRuntimeStore.ts
import { ZodError } from 'zod'
import { Runtime, RuntimeDef, RuntimeStateSchema } from './runtime.js'
import {
  RuntimeStore,
  RuntimeStoreError,
  type RuntimeStoreErrorCode,
  type ListOptions,
  type ListResult,
} from './runtimeStore.js'

export class InMemoryRuntimeStore extends RuntimeStore {
  private readonly store = new Map<string, Runtime>()

  // util: convert unknown error → RuntimeStoreError with code/message
  private asStoreError(
    err: unknown,
    fallbackCode: RuntimeStoreErrorCode,
    msg: string,
  ): RuntimeStoreError {
    if (err instanceof RuntimeStoreError) return err
    if (err instanceof ZodError) {
      return new RuntimeStoreError('VALIDATION', msg, err.issues)
    }
    const text = err instanceof Error ? err.message : String(err)
    return new RuntimeStoreError(fallbackCode ?? 'UNKNOWN', `${msg}: ${text}`, err)
  }

  // util: return a fresh Runtime instance so callers can’t mutate stored instance
  private cloneRuntime(rt: Runtime): Runtime {
    return new Runtime(rt.serialize())
  }

  protected async initialize(): Promise<void> {
    return
  }

  public async _create(workflowId: string, initial?: Partial<RuntimeDef>): Promise<Runtime> {
    if (!workflowId) throw new RuntimeStoreError('VALIDATION', 'workflowId is required')
    if (this.store.has(workflowId)) {
      throw new RuntimeStoreError('ALREADY_EXISTS', `runtime for "${workflowId}" already exists`)
    }

    try {
      const def: RuntimeDef = RuntimeStateSchema.parse({
        queue: [],
        visited: [],
        current: null,
        finished: false,
        id: workflowId,
        ...(initial ?? {}),
      })
      const runtime = new Runtime(def)
      this.store.set(workflowId, runtime)
      return this.cloneRuntime(runtime)
    } catch (err) {
      console.error(err)
      throw this.asStoreError(err, 'VALIDATION', 'Failed to create runtime')
    }
  }

  public async _get(workflowId: string): Promise<Runtime> {
    if (!workflowId) throw new RuntimeStoreError('VALIDATION', 'workflowId is required')
    const existing = this.store.get(workflowId)
    if (!existing) throw new RuntimeStoreError('NOT_FOUND', `runtime for "${workflowId}" not found`)
    return this.cloneRuntime(existing)
  }

  public async _update(workflowId: string, patch: Partial<RuntimeDef>): Promise<Runtime> {
    if (!workflowId) throw new RuntimeStoreError('VALIDATION', 'workflowId is required')
    const existing = this.store.get(workflowId)
    if (!existing) throw new RuntimeStoreError('NOT_FOUND', `runtime for "${workflowId}" not found`)

    try {
      const merged = RuntimeStateSchema.parse({ ...existing.serialize(), ...(patch ?? {}) })
      const runtime = new Runtime(merged)
      this.store.set(workflowId, runtime)
      return this.cloneRuntime(runtime)
    } catch (err) {
      throw this.asStoreError(err, 'VALIDATION', 'Failed to update runtime')
    }
  }

  public async _exists(workflowId: string): Promise<boolean> {
    return this.store.has(workflowId)
  }

  public async _delete(workflowId: string): Promise<void> {
    this.store.delete(workflowId)
  }

  public async _replace(workflowId: string, def: RuntimeDef): Promise<Runtime> {
    if (!workflowId) throw new RuntimeStoreError('VALIDATION', 'workflowId is required')
    try {
      const parsed = RuntimeStateSchema.parse(def)
      const runtime = new Runtime(parsed)
      this.store.set(workflowId, runtime)
      return this.cloneRuntime(runtime)
    } catch (err) {
      throw this.asStoreError(err, 'VALIDATION', 'Failed to replace runtime')
    }
  }

  public async _snapshot(workflowId: string): Promise<RuntimeDef> {
    const rt = await this.get(workflowId)
    return rt.serialize() // plain data, safe to hand out
  }

  public async _list(options?: ListOptions): Promise<ListResult> {
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))
    const all = Array.from(this.store.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, rt]) => rt.serialize())

    let start = 0
    if (options?.cursor) {
      const idx = all.findIndex((s) => s && s.queue && s.visited) // trivial probe; order by id not tracked in def
      start = idx >= 0 ? idx + 1 : 0
    }

    const slice = all.slice(start, start + limit)
    const nextCursor = start + limit < all.length ? String(start + limit) : undefined

    return { items: slice, nextCursor }
  }

  public async _seedIfEmpty(workflowId: string, entry: string): Promise<Runtime> {
    if (!workflowId) throw new RuntimeStoreError('VALIDATION', 'workflowId is required')
    const existing = this.store.get(workflowId)
    if (!existing) throw new RuntimeStoreError('NOT_FOUND', `runtime for "${workflowId}" not found`)

    const snap = existing.serialize()
    if (snap.queue.length === 0 && snap.visited.length === 0 && !snap.finished) {
      snap.queue = [entry]
      const seeded = new Runtime(RuntimeStateSchema.parse(snap))
      this.store.set(workflowId, seeded)
      return this.cloneRuntime(seeded)
    }
    return this.cloneRuntime(existing)
  }
}
