import { z } from 'zod'

export const EdgeRef = z.string().min(16)
export type EdgeRefType = z.infer<typeof EdgeRef>

export const EdgeDef = z
  .object({
    id: EdgeRef,
    from: z.string(),
    to: z.string(),
    condition: z.string().optional(), // expression string
  })
  .openapi('Edge')

export type EdgeDefType = z.infer<typeof EdgeDef>

export class EdgeDefClass {
  protected edgeDef: EdgeDefType
  constructor(edgeDef: EdgeDefType) {
    this.edgeDef = edgeDef
  }

  getId(): string {
    return this.edgeDef.id
  }

  getFrom(): string {
    return this.edgeDef.from
  }

  getTo(): string {
    return this.edgeDef.to
  }

  getCondition(): string | undefined {
    return this.edgeDef.condition
  }

  // optionally: one-line helper to get the whole object
  getAll(): EdgeDefType {
    return this.edgeDef
  }
}
