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
