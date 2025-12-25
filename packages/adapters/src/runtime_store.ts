import { Pool } from 'pg'
import { Runtime, RuntimeDef, RuntimeStore, RuntimeStoreError } from '@mini-math/runtime'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, sql, inArray } from 'drizzle-orm'
import { ListOptions, ListResult } from '@mini-math/utils'

import * as schema from './db/schema/3_runtime.js'
import { runtimes } from './db/schema/3_runtime.js'
import { makeLogger, Logger } from '@mini-math/logger'

type Db = NodePgDatabase<typeof schema>
type RuntimeRow = typeof runtimes.$inferSelect
type RuntimeInsert = typeof runtimes.$inferInsert

export class PostgresRuntimeStore extends RuntimeStore {
  private db!: Db
  private pool!: Pool
  private logger: Logger

  private readonly postgresUrl: string

  constructor(postgresUrl: string, loggerName: string = 'runtime-store') {
    super()
    this.postgresUrl = postgresUrl
    this.logger = makeLogger(loggerName)
  }

  private handleError(method: string, err: unknown, context?: Record<string, unknown>): never {
    this.logger.error(
      JSON.stringify({
        err,
        method,
        ...context,
      }) + ' PostgresRuntimeStore operation failed',
    )
    // Rethrow the original error to preserve behavior
    throw err
  }

  protected async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')
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
      this.logger.info('initialized successfully')
    } catch (err) {
      this.handleError('initialize', err, { postgresUrl: this.postgresUrl })
    }
  }

  protected async _create(workflowId: string, initial?: Partial<RuntimeDef>): Promise<Runtime> {
    try {
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
    } catch (err) {
      this.handleError('_create', err, { workflowId })
    }
  }

  protected async _createBatchOrNone(
    batch: { workflowId: string; initial?: Partial<RuntimeDef> }[],
  ): Promise<Runtime[]> {
    if (!batch?.length) return []

    // 1) Validate + detect duplicates inside the batch
    const seen = new Set<string>()
    for (const { workflowId } of batch) {
      if (!workflowId) throw new RuntimeStoreError('VALIDATION', 'workflowId is required')
      if (seen.has(workflowId)) {
        throw new RuntimeStoreError('VALIDATION', `duplicate workflowId in batch: "${workflowId}"`)
      }
      seen.add(workflowId)
    }

    const ids = [...seen]

    try {
      return await this.db.transaction(async (tx) => {
        // 2) "OrNone": if ANY already exists, do nothing
        const existing = await tx
          .select({ id: runtimes.id })
          .from(runtimes)
          .where(inArray(runtimes.id, ids))
          .limit(1)

        if (existing.length > 0) return []

        // 3) Build all states first (so we fail before inserting anything)
        const rowsToInsert: RuntimeInsert[] = batch.map(({ workflowId, initial }) => {
          const state = buildRuntimeDef(workflowId, initial)
          return {
            id: state.id,
            queue: state.queue,
            visited: state.visited,
            current: state.current,
            finished: state.finished,
          } satisfies RuntimeInsert
        })

        // 4) Insert all in one statement, return all inserted rows
        const inserted = await tx.insert(runtimes).values(rowsToInsert).returning()

        // 5) Return in the same order as input (DB returning order is not guaranteed)
        const byId = new Map(inserted.map((r) => [r.id, r]))
        return batch.map(({ workflowId }) => new Runtime(rowToDef(byId.get(workflowId)!)))
      })
    } catch (err) {
      this.handleError('_createBatchOrNone', err, { ids })
    }
  }

  protected async _get(workflowId: string): Promise<Runtime | undefined> {
    try {
      const row = await this.db.query.runtimes.findFirst({
        where: eq(runtimes.id, workflowId),
      })

      if (!row) {
        return undefined
      }

      const def = rowToDef(row)
      return new Runtime(def)
    } catch (err) {
      this.handleError('_get', err, { workflowId })
    }
  }

  protected async _update(
    workflowId: string,
    patch: Partial<RuntimeDef>,
  ): Promise<Runtime | undefined> {
    try {
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
        return undefined
      }

      const def = rowToDef(row)
      return new Runtime(def)
    } catch (err) {
      this.handleError('_update', err, { workflowId, patch })
    }
  }

  protected async _exists(workflowId: string): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ id: runtimes.id })
        .from(runtimes)
        .where(eq(runtimes.id, workflowId))
        .limit(1)

      return rows.length > 0
    } catch (err) {
      this.handleError('_exists', err, { workflowId })
    }
  }

  protected async _delete(workflowId: string): Promise<void> {
    try {
      await this.db.delete(runtimes).where(eq(runtimes.id, workflowId))
    } catch (err) {
      this.handleError('_delete', err, { workflowId })
    }
  }

  protected async _replace(workflowId: string, def: RuntimeDef): Promise<Runtime> {
    try {
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
    } catch (err) {
      this.handleError('_replace', err, { workflowId })
    }
  }

  protected async _snapshot(workflowId: string): Promise<RuntimeDef | undefined> {
    try {
      const row = await this.db.query.runtimes.findFirst({
        where: eq(runtimes.id, workflowId),
      })

      if (!row) {
        return undefined
      }

      return rowToDef(row)
    } catch (err) {
      this.handleError('_snapshot', err, { workflowId })
    }
  }

  protected async _list(options?: ListOptions): Promise<ListResult<RuntimeDef>> {
    try {
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

      const result: ListResult<RuntimeDef> = {
        items,
        nextCursor,
      }

      return result
    } catch (err) {
      this.handleError('_list', err, { options })
    }
  }

  protected async _seedIfEmpty(workflowId: string, entry: string): Promise<Runtime | undefined> {
    try {
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
    } catch (err) {
      this.handleError('_seedIfEmpty', err, { workflowId, entry })
    }
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
