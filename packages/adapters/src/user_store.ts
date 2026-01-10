import { and, eq, sql } from 'drizzle-orm'
import type { ListOptions, ListResult } from '@mini-math/utils'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import {
  UserStore,
  type UserRecord,
  type CreditDelta,
  type EvmPaymentAddressResolver,
  EvmPaymentAddressSchema,
} from '@mini-math/rbac'

import { users } from './db/schema/0_users'
import * as schema from './db/schema/0_users.js'
import { makeLogger, Logger } from '@mini-math/logger'

type Db = NodePgDatabase<typeof schema>

export class PostgresUserStore extends UserStore {
  private db!: Db
  private pool!: Pool
  private logger: Logger
  private readonly postgresUrl: string

  constructor(postgresUrl: string, resolveEvmPaymentAddress: EvmPaymentAddressResolver) {
    super(resolveEvmPaymentAddress)
    this.postgresUrl = postgresUrl
    this.logger = makeLogger('PostgresUserStore')
  }

  private handleError(method: string, err: unknown, context?: Record<string, unknown>): never {
    this.logger.error(
      JSON.stringify({
        err,
        method,
        ...context,
      }) + ' PostgresUserStore operation failed',
    )
    throw err
  }

  protected async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')
      this.pool = new Pool({ connectionString: this.postgresUrl })
      this.db = drizzle(this.pool, { schema })
      await this.db.execute(sql`select 1`)
      this.logger.info('initialized successfully')
    } catch (err) {
      this.handleError('initialize', err, { postgresUrl: this.postgresUrl })
    }
  }

  protected async _create(
    userId: string,
    evm_payment_address: string,
    delta?: CreditDelta,
  ): Promise<boolean> {
    try {
      const addr = EvmPaymentAddressSchema.parse(evm_payment_address)

      const res = await this.db
        .insert(users)
        .values({
          userId,
          evm_payment_address: addr,
          unifiedCredits: delta?.unifiedCredits ?? 0,
          cdpAccountCredits: delta?.cdpAccountCredits ?? 0,
        })
        .onConflictDoNothing()
        .returning({ userId: users.userId, evm_payment_address: users.evm_payment_address })

      return res.length > 0
    } catch (err) {
      this.handleError('_create', err, { userId, evm_payment_address })
    }
  }

  protected async _get(
    userId: string,
    evm_payment_address: string,
  ): Promise<UserRecord | undefined> {
    try {
      const addr = EvmPaymentAddressSchema.parse(evm_payment_address)

      const [row] = await this.db
        .select({
          userId: users.userId,
          evm_payment_address: users.evm_payment_address,
          unifiedCredits: users.unifiedCredits,
          cdpAccountCredits: users.cdpAccountCredits,
        })
        .from(users)
        .where(and(eq(users.userId, userId), eq(users.evm_payment_address, addr)))
        .limit(1)

      if (!row) return undefined

      return {
        userId: row.userId,
        evm_payment_address: row.evm_payment_address,
        unifiedCredits: row.unifiedCredits ?? 0,
        cdpAccountCredits: row.cdpAccountCredits ?? 0,
      } as UserRecord
    } catch (err) {
      this.handleError('_get', err, { userId, evm_payment_address })
    }
  }

  protected async _upsert(
    userId: string,
    evm_payment_address: string,
    patch: Partial<Omit<UserRecord, 'userId' | 'evm_payment_address'>>,
  ): Promise<UserRecord> {
    try {
      const addr = EvmPaymentAddressSchema.parse(evm_payment_address)

      const insertValues = {
        userId,
        evm_payment_address: addr,
        unifiedCredits: patch.unifiedCredits ?? 0,
        cdpAccountCredits: patch.cdpAccountCredits ?? 0,
      }

      const [row] = await this.db
        .insert(users)
        .values(insertValues)
        .onConflictDoUpdate({
          target: [users.userId, users.evm_payment_address],
          set: {
            unifiedCredits:
              patch.unifiedCredits === undefined
                ? users.unifiedCredits
                : sql`excluded."unifiedCredits"`,
            cdpAccountCredits:
              patch.cdpAccountCredits === undefined
                ? users.cdpAccountCredits
                : sql`excluded."cdpAccountCredits"`,
          },
        })
        .returning({
          userId: users.userId,
          evm_payment_address: users.evm_payment_address,
          unifiedCredits: users.unifiedCredits,
          cdpAccountCredits: users.cdpAccountCredits,
        })

      return {
        userId: row!.userId,
        evm_payment_address: row!.evm_payment_address,
        unifiedCredits: row!.unifiedCredits ?? 0,
        cdpAccountCredits: row!.cdpAccountCredits ?? 0,
      } as UserRecord
    } catch (err) {
      this.handleError('_upsert', err, { userId, evm_payment_address, patch })
    }
  }

  protected async _adjustCredits(
    userId: string,
    evm_payment_address: string,
    delta: CreditDelta,
  ): Promise<UserRecord> {
    try {
      const addr = EvmPaymentAddressSchema.parse(evm_payment_address)

      const dUnified = delta.unifiedCredits ?? 0
      const dCdp = delta.cdpAccountCredits ?? 0

      const [row] = await this.db
        .insert(users)
        .values({
          userId,
          evm_payment_address: addr,
          unifiedCredits: dUnified,
          cdpAccountCredits: dCdp,
        })
        .onConflictDoUpdate({
          target: [users.userId, users.evm_payment_address],
          set: {
            unifiedCredits: sql`${users.unifiedCredits} + ${dUnified}`,
            cdpAccountCredits: sql`${users.cdpAccountCredits} + ${dCdp}`,
          },
        })
        .returning({
          userId: users.userId,
          evm_payment_address: users.evm_payment_address,
          unifiedCredits: users.unifiedCredits,
          cdpAccountCredits: users.cdpAccountCredits,
        })

      return {
        userId: row!.userId,
        evm_payment_address: row!.evm_payment_address,
        unifiedCredits: row!.unifiedCredits ?? 0,
        cdpAccountCredits: row!.cdpAccountCredits ?? 0,
      } as UserRecord
    } catch (err) {
      this.handleError('_adjustCredits', err, { userId, evm_payment_address, delta })
    }
  }

  protected async _exists(userId: string, evm_payment_address: string): Promise<boolean> {
    try {
      const addr = EvmPaymentAddressSchema.parse(evm_payment_address)

      const [row] = await this.db
        .select({ userId: users.userId })
        .from(users)
        .where(and(eq(users.userId, userId), eq(users.evm_payment_address, addr)))
        .limit(1)

      return !!row
    } catch (err) {
      this.handleError('_exists', err, { userId, evm_payment_address })
    }
  }

  protected async _delete(userId: string, evm_payment_address: string): Promise<boolean> {
    try {
      const addr = EvmPaymentAddressSchema.parse(evm_payment_address)

      const res = await this.db
        .delete(users)
        .where(and(eq(users.userId, userId), eq(users.evm_payment_address, addr)))
        .returning({ userId: users.userId, evm_payment_address: users.evm_payment_address })

      return res.length > 0
    } catch (err) {
      this.handleError('_delete', err, { userId, evm_payment_address })
    }
  }

  protected async _list(options?: ListOptions): Promise<ListResult<UserRecord>> {
    try {
      const cursor = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0
      const limit = options?.limit ?? 50

      const totalRows = await this.db.select({ value: sql<number>`count(*)` }).from(users)
      const total = totalRows[0]?.value ?? 0

      const rows = await this.db
        .select({
          userId: users.userId,
          evm_payment_address: users.evm_payment_address,
          unifiedCredits: users.unifiedCredits,
          cdpAccountCredits: users.cdpAccountCredits,
        })
        .from(users)
        .orderBy(users.userId, users.evm_payment_address)
        .offset(cursor)
        .limit(limit)

      const items: UserRecord[] = rows.map((r) => ({
        userId: r.userId,
        evm_payment_address: r.evm_payment_address,
        unifiedCredits: r.unifiedCredits ?? 0,
        cdpAccountCredits: r.cdpAccountCredits ?? 0,
      })) as UserRecord[]

      const nextCursor = cursor + limit < total ? String(cursor + limit) : undefined
      return { items, nextCursor }
    } catch (err) {
      this.handleError('_list', err, { options })
    }
  }

  protected async _getByPaymentAddress(
    evm_payment_address: string,
  ): Promise<UserRecord | undefined> {
    try {
      const addr = EvmPaymentAddressSchema.parse(evm_payment_address)

      const [row] = await this.db
        .select({
          userId: users.userId,
          evm_payment_address: users.evm_payment_address,
          unifiedCredits: users.unifiedCredits,
          cdpAccountCredits: users.cdpAccountCredits,
        })
        .from(users)
        .where(eq(users.evm_payment_address, addr))
        .limit(1)

      if (!row) return undefined

      return {
        userId: row.userId,
        evm_payment_address: row.evm_payment_address,
        unifiedCredits: row.unifiedCredits ?? 0,
        cdpAccountCredits: row.cdpAccountCredits ?? 0,
      } as UserRecord
    } catch (err) {
      this.handleError('_getByPaymentAddress', err, { evm_payment_address })
    }
  }
}
