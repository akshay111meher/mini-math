import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, eq, like, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { makeLogger, Logger } from '@mini-math/logger'

import * as schema from './db/schema/9_kvs'
import { kvs } from './db/schema/9_kvs'

type Db = NodePgDatabase<typeof schema>

export type KvPair = { key: string; value: string }

export class PostgresKeyValueStore {
  private db!: Db
  private pool!: Pool
  private readonly postgresUrl: string
  private logger: Logger
  private initialized = false

  constructor(postgresUrl: string) {
    this.postgresUrl = postgresUrl
    this.logger = makeLogger('PostgresKeyValueStore')
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    await this.initialize()
    this.initialized = true
  }

  private async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')

      this.pool = new Pool({ connectionString: this.postgresUrl })
      this.db = drizzle(this.pool, { schema })

      // connectivity check
      await this.db.execute(sql`select 1`)
      this.logger.info('initialized successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to initialize: ${msg}`)
      throw err
    }
  }

  /** Insert or update */
  public async set(key: string, value: string): Promise<void> {
    await this.ensureInitialized()

    try {
      this.logger.debug(`set key=${key}`)

      await this.db
        .insert(kvs)
        .values({ key, value })
        .onConflictDoUpdate({
          target: [kvs.key],
          set: { value: sql`excluded."value"` },
        })

      this.logger.trace(`set ok key=${key}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to set key=${key}: ${msg}`)
      throw err
    }
  }

  /** Returns null when missing */
  public async get(key: string): Promise<string | null> {
    await this.ensureInitialized()

    try {
      this.logger.debug(`get key=${key}`)

      const [row] = await this.db
        .select({ value: kvs.value })
        .from(kvs)
        .where(eq(kvs.key, key))
        .limit(1)

      return row ? row.value : null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to get key=${key}: ${msg}`)
      throw err
    }
  }

  /** Returns true if a row was deleted */
  public async delete(key: string): Promise<boolean> {
    await this.ensureInitialized()

    try {
      this.logger.debug(`delete key=${key}`)

      const deleted = await this.db.delete(kvs).where(eq(kvs.key, key)).returning({ key: kvs.key })

      return deleted.length > 0
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to delete key=${key}: ${msg}`)
      throw err
    }
  }

  /**
   * Lists all KVs, or only those with a prefix.
   * If you don’t want prefix support, delete the param + where clause.
   */
  public async list(prefix?: string): Promise<KvPair[]> {
    await this.ensureInitialized()

    try {
      this.logger.debug(`list prefix=${prefix ?? '(none)'}`)

      const whereClause = prefix ? like(kvs.key, `${prefix}%`) : undefined

      const rows = await this.db
        .select({ key: kvs.key, value: kvs.value })
        .from(kvs)
        .where(whereClause as any)

      return rows.map((r) => ({ key: r.key, value: r.value }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to list: ${msg}`)
      throw err
    }
  }

  /**
   * Optional: Close pool when your process shuts down cleanly.
   * Not strictly required, but nice for tests.
   */
  public async close(): Promise<void> {
    if (!this.pool) return
    await this.pool.end()
  }
}
