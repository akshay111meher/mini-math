import { Pool } from 'pg'
import { ListOptions, ListResult, Runtime, RuntimeDef, RuntimeStore } from '@mini-math/runtime'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, sql } from 'drizzle-orm'

import * as schema from './db/schema/runtime.js'
import { runtimes } from './db/schema/runtime.js'

type Db = NodePgDatabase<typeof schema>
type RuntimeRow = typeof runtimes.$inferSelect
type RuntimeInsert = typeof runtimes.$inferInsert

export class PostgresRuntimeStore extends RuntimeStore {
  private db!: Db
  private pool!: Pool

  private readonly postgresUrl: string

  constructor(postgresUrl: string) {
    super()
    this.postgresUrl = postgresUrl
  }

  protected async initialize(): Promise<void> {
    // 1. Create PG pool
    this.pool = new Pool({
      connectionString: this.postgresUrl,
    })

    // 2. Wrap pool in Drizzle
    this.db = drizzle(this.pool, {
      schema,
    })

    // 3. Optional sanity check – ensure DB is reachable
    await this.db.execute(sql`select 1`)
  }
  protected async _create(workflowId: string, initial?: Partial<RuntimeDef>): Promise<Runtime> {
    const state = buildRuntimeDef(workflowId, initial)

    const [row] = await this.db
      .insert(runtimes)
      .values({
        id: state.id,
        queue: state.queue,
        visited: state.visited,
        current: state.current,
        finished: state.finished,
      } satisfies RuntimeInsert)
      .returning()

    const def = rowToDef(row)
    // adjust ctor if your Runtime has a different signature
    return new Runtime(def)
  }

  protected async _get(workflowId: string): Promise<Runtime> {
    const row = await this.db.query.runtimes.findFirst({
      where: eq(runtimes.id, workflowId),
    })

    if (!row) {
      throw new Error(`Runtime for workflow ${workflowId} not found`)
    }

    const def = rowToDef(row)
    return new Runtime(def)
  }
  protected async _update(workflowId: string, patch: Partial<RuntimeDef>): Promise<Runtime> {
    const update: Partial<RuntimeInsert> = {}

    if ('queue' in patch && patch.queue !== undefined) {
      update.queue = patch.queue
    }
    if ('visited' in patch && patch.visited !== undefined) {
      update.visited = patch.visited
    }
    if ('current' in patch) {
      update.current = patch.current ?? null
    }
    if ('finished' in patch && patch.finished !== undefined) {
      update.finished = patch.finished
    }

    if (Object.keys(update).length === 0) {
      // nothing to change; just return current runtime
      return this._get(workflowId)
    }

    const [row] = await this.db
      .update(runtimes)
      .set(update)
      .where(eq(runtimes.id, workflowId))
      .returning()

    if (!row) {
      throw new Error(`Runtime for workflow ${workflowId} not found`)
    }

    const def = rowToDef(row)
    return new Runtime(def)
  }
  protected async _exists(workflowId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: runtimes.id })
      .from(runtimes)
      .where(eq(runtimes.id, workflowId))
      .limit(1)

    return rows.length > 0
  }
  protected async _delete(workflowId: string): Promise<void> {
    await this.db.delete(runtimes).where(eq(runtimes.id, workflowId))
  }
  protected async _replace(workflowId: string, def: RuntimeDef): Promise<Runtime> {
    const [row] = await this.db
      .insert(runtimes)
      .values({
        id: workflowId,
        queue: def.queue,
        visited: def.visited,
        current: def.current,
        finished: def.finished,
      } satisfies RuntimeInsert)
      .onConflictDoUpdate({
        target: runtimes.id,
        set: {
          queue: def.queue,
          visited: def.visited,
          current: def.current,
          finished: def.finished,
        },
      })
      .returning()

    const nextDef = rowToDef(row)
    return new Runtime(nextDef)
  }
  protected async _snapshot(workflowId: string): Promise<RuntimeDef> {
    const row = await this.db.query.runtimes.findFirst({
      where: eq(runtimes.id, workflowId),
    })

    if (!row) {
      throw new Error(`Runtime for workflow ${workflowId} not found`)
    }

    return rowToDef(row)
  }
  protected async _list(options?: ListOptions): Promise<ListResult> {
    const limit = options?.limit ?? 50
    const offset = options?.cursor ? Number(options.cursor) : 0

    const itemsQuery = this.db
      .select()
      .from(runtimes)
      .limit(limit)
      .offset(offset)
      .orderBy(runtimes.id) // or createdAt if you add one later

    const countQuery = this.db.select({ count: sql<number>`count(*)` }).from(runtimes)

    const [rows, [countRow]] = await Promise.all([itemsQuery, countQuery])

    const items = rows.map(rowToDef)
    const total = Number(countRow.count)

    const nextOffset = offset + limit
    const nextCursor = nextOffset < total ? String(nextOffset) : undefined

    const result: ListResult = {
      items,
      nextCursor,
    }

    return result
  }
  protected async _seedIfEmpty(workflowId: string, entry: string): Promise<Runtime> {
    const exists = await this._exists(workflowId)
    if (exists) {
      return this._get(workflowId)
    }

    const initial: Partial<RuntimeDef> = {
      queue: [entry],
      visited: [],
      current: entry,
      finished: false,
    }

    return this._create(workflowId, initial)
  }
}

function buildRuntimeDef(workflowId: string, initial?: Partial<RuntimeDef>): RuntimeDef {
  return {
    id: workflowId,
    queue: initial?.queue ?? [],
    visited: initial?.visited ?? [],
    current: initial?.current ?? null,
    finished: initial?.finished ?? false,
  }
}

function rowToDef(row: RuntimeRow): RuntimeDef {
  return {
    id: row.id,
    queue: (row.queue ?? []) as string[],
    visited: (row.visited ?? []) as string[],
    current: row.current ?? null,
    finished: row.finished ?? false,
  }
}
