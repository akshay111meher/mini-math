import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

export const RuntimeStateSchema = z
  .object({
    queue: z.array(z.string()).default([]), // BFS frontier
    visited: z.array(z.string()).default([]), // nodes we've already processed
    current: z.string().nullable().default(null), // last returned nodeId
    finished: z.boolean().default(false),
  })
  .openapi('RuntimeState')

export type RuntimeDef = z.infer<typeof RuntimeStateSchema>

export class Runtime {
  constructor(private runtimeDef: RuntimeDef) {}

  public serialize(): RuntimeDef {
    const r = RuntimeStateSchema.parse(this.runtimeDef) // apply defaults & validate
    return {
      queue: r.queue.slice(),
      visited: r.visited.slice(),
      current: r.current ?? null,
      finished: Boolean(r.finished),
    }
  }
}

export type RuntimeResult = { status: boolean; message: string; runtime: Runtime | null }

export class RuntimeStore {
  private store = new Map<string, Runtime>()

  constructor() {}

  public get(workflowId: string, initial?: Partial<RuntimeDef>): RuntimeResult {
    if (!workflowId) {
      return { status: false, message: 'workflowId is required', runtime: null }
    }

    const existing = this.store.get(workflowId)
    if (existing) {
      return { status: true, message: 'existing', runtime: existing }
    }

    try {
      const def: RuntimeDef = RuntimeStateSchema.parse({
        queue: [],
        visited: [],
        current: null,
        finished: false,
        ...(initial ?? {}),
      })
      const runtime = new Runtime(def)
      this.store.set(workflowId, runtime)
      return { status: true, message: 'created', runtime }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: false, message: msg, runtime: null }
    }
  }

  public update(workflowId: string, patch: Partial<RuntimeDef>): RuntimeResult {
    const existing = this.store.get(workflowId)
    if (!existing) return { status: false, message: 'runtime not found', runtime: null }

    try {
      const merged = RuntimeStateSchema.parse({ ...existing.serialize(), ...(patch ?? {}) })
      const runtime = new Runtime(merged)
      this.store.set(workflowId, runtime)
      return { status: true, message: 'updated', runtime }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: false, message: msg, runtime: existing }
    }
  }
}
