// postgresCdpAccountStore.ts
import { ListOptions, ListResult } from '@mini-math/utils'
import { CdpAccountStore, CdpAccountName } from '@mini-math/secrets'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { makeLogger, Logger } from '@mini-math/logger'

// If you have a barrel, import from there. Here I assume a dedicated schema file:
import * as schema from './db/schema/6_cdp_accounts'
import { cdpAccounts } from './db/schema/6_cdp_accounts'

type Db = NodePgDatabase<typeof schema>

/** Store-specific errors (kept lightweight + explicit). */
export type PostgresCdpAccountStoreErrorCode = 'INIT_FAILED' | 'DB' | 'VALIDATION' | 'NOT_FOUND'

export class PostgresCdpAccountStoreError extends Error {
  constructor(
    public readonly code: PostgresCdpAccountStoreErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'PostgresCdpAccountStoreError'
  }
}

function assertNonEmpty(v: string, name: string) {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new PostgresCdpAccountStoreError('VALIDATION', `${name} must be a non-empty string`, {
      name,
      v,
    })
  }
}

function clampLimit(limit: unknown, fallback = 50, max = 200): number {
  if (limit === undefined || limit === null) return fallback
  const n = Number(limit)
  if (!Number.isFinite(n) || n <= 0) {
    throw new PostgresCdpAccountStoreError('VALIDATION', 'limit must be a positive number', {
      limit,
    })
  }
  return Math.min(Math.floor(n), max)
}

function encodeCursor(accountName: string): string {
  return Buffer.from(accountName, 'utf8').toString('base64url')
}
function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    throw new PostgresCdpAccountStoreError('VALIDATION', 'Invalid cursor')
  }
}

export class PostgresCdpAccountStore extends CdpAccountStore {
  private db!: Db
  private pool!: Pool
  private readonly postgresUrl: string
  private logger: Logger

  constructor(postgresUrl: string) {
    super()
    this.postgresUrl = postgresUrl
    this.logger = makeLogger('PostgresCdpAccountStore')
  }

  // Your abstract base uses onInit()
  protected async onInit(): Promise<void> {
    try {
      this.logger.debug('Initializing')

      this.pool = new Pool({ connectionString: this.postgresUrl })
      this.db = drizzle(this.pool, { schema })

      // Connectivity check
      await this.db.execute(sql`select 1`)

      this.logger.info('initialized successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to initialize: ${msg}`)
      throw new PostgresCdpAccountStoreError(
        'INIT_FAILED',
        'Failed to initialize PostgresCdpAccountStore',
        {
          cause: msg,
        },
      )
    }
  }

  /**
   * Must throw if missing (per your contract).
   * We throw NOT_FOUND as a typed store error.
   */
  protected async _existCdpAccountName(userId: string, accountName: string): Promise<boolean> {
    assertNonEmpty(userId, 'userId')
    assertNonEmpty(accountName, 'accountName')

    try {
      this.logger.debug(`Exist check userId=${userId}, accountName=${accountName}`)

      const rows = await this.db
        .select({ userId: cdpAccounts.userId })
        .from(cdpAccounts)
        .where(and(eq(cdpAccounts.userId, userId), eq(cdpAccounts.accountName, accountName)))
        .limit(1)

      return rows.length > 0
    } catch (err) {
      if (err instanceof PostgresCdpAccountStoreError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Exist check failed userId=${userId}, accountName=${accountName}: ${msg}`)
      throw new PostgresCdpAccountStoreError('DB', 'Failed to check cdp account existence', {
        userId,
        accountName,
        cause: msg,
      })
    }
  }

  /**
   * Insert (userId, accountName).
   * Return true if inserted, false if already exists.
   */
  protected async _storeCdpAccountName(userId: string, accountName: string): Promise<boolean> {
    assertNonEmpty(userId, 'userId')
    assertNonEmpty(accountName, 'accountName')

    try {
      this.logger.debug(`Storing cdp account userId=${userId}, accountName=${accountName}`)

      // Option A (best): use ON CONFLICT DO NOTHING (keeps it single round-trip)
      const inserted = await this.db
        .insert(cdpAccounts)
        .values({ userId, accountName })
        .onConflictDoNothing() // requires drizzle version that supports this for pg
        .returning({ userId: cdpAccounts.userId })

      const ok = inserted.length > 0
      this.logger.trace(`Store result userId=${userId}, accountName=${accountName}: inserted=${ok}`)
      return ok
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to store cdp account userId=${userId}, accountName=${accountName}: ${msg}`,
      )
      throw new PostgresCdpAccountStoreError('DB', 'Failed to store cdp account', {
        userId,
        accountName,
        cause: msg,
      })
    }
  }

  /**
   * Paginated list for a user.
   * Deterministic order: accountName ASC. Cursor is base64url(accountName).
   * Cursor means "return items strictly after this accountName".
   */
  protected async _listCdpAccountNamesByUser(
    userId: string,
    opts: ListOptions = {},
  ): Promise<ListResult<CdpAccountName>> {
    assertNonEmpty(userId, 'userId')

    const limit = clampLimit(opts.limit, 50, 200)
    const afterName = opts.cursor ? decodeCursor(opts.cursor) : undefined

    try {
      this.logger.debug(
        `Listing cdp accounts userId=${userId} limit=${limit} cursor=${opts.cursor ?? 'none'}`,
      )

      const whereClause = afterName
        ? and(eq(cdpAccounts.userId, userId), gt(cdpAccounts.accountName, afterName))
        : eq(cdpAccounts.userId, userId)

      // Fetch limit+1 to determine nextCursor without a COUNT(*)
      const rows = await this.db
        .select({
          userId: cdpAccounts.userId,
          accountName: cdpAccounts.accountName,
        })
        .from(cdpAccounts)
        .where(whereClause)
        .orderBy(asc(cdpAccounts.accountName))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows

      const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!.accountName) : undefined

      this.logger.trace(
        `Listed ${page.length} cdp accounts for userId=${userId} hasMore=${hasMore}`,
      )

      return {
        items: page.map((r) => ({ userId: r.userId, accountName: r.accountName })),
        nextCursor,
      }
    } catch (err) {
      if (err instanceof PostgresCdpAccountStoreError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to list cdp accounts for userId=${userId}: ${msg}`)
      throw new PostgresCdpAccountStoreError('DB', 'Failed to list cdp accounts', {
        userId,
        cause: msg,
      })
    }
  }

  /**
   * Optional: clean shutdown hook (nice in tests / graceful shutdown).
   * Not required by your abstract class, but harmless & useful.
   */
  public async close(): Promise<void> {
    try {
      await this.pool?.end()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to close pool: ${msg}`)
    }
  }
}
