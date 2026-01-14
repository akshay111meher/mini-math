// PostgresTransactionStore.ts
import { makeLogger, Logger } from '@mini-math/logger'
import {
  BalanceView,
  CreateUserTx,
  EvmRef,
  TransactionListOptions,
  TxConflictError,
  TxFilter,
  UserTransactionStore,
  UserTxRecord,
  UUID,
} from '@mini-math/rbac'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from './db/schema/8_transaction_store'
import { userTransactions } from './db/schema/8_transaction_store'

type Db = NodePgDatabase<typeof schema>

function normalizeAddress(addr: string): string {
  return addr.toLowerCase()
}

function sameEvmRef(a: EvmRef, b: EvmRef): boolean {
  return (
    a.chainId === b.chainId &&
    normalizeAddress(a.tokenAddress) === normalizeAddress(b.tokenAddress) &&
    a.txHash.toLowerCase() === b.txHash.toLowerCase() &&
    (a.logIndex ?? 0) === (b.logIndex ?? 0)
  )
}

function samePlatformRefIdentity(
  a: CreateUserTx['platformRef'] | undefined,
  b: CreateUserTx['platformRef'] | undefined,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.kind === b.kind && (a.refId ?? '') === (b.refId ?? '')
}

function txIdentityCompatible(existing: CreateUserTx, incoming: CreateUserTx): boolean {
  if (existing.userId !== incoming.userId) return false
  if (existing.direction !== incoming.direction) return false
  if (existing.source !== incoming.source) return false

  if (existing.source === 'evm') {
    if (!existing.evmRef || !incoming.evmRef) return false
    return sameEvmRef(existing.evmRef, incoming.evmRef)
  }

  if (existing.platformRef || incoming.platformRef) {
    return samePlatformRefIdentity(existing.platformRef, incoming.platformRef)
  }

  return true
}

function rowToRecord(row: typeof userTransactions.$inferSelect): UserTxRecord {
  const assetAmount =
    typeof row.assetAmount === 'string' ? row.assetAmount : String(row.assetAmount)

  const evmRef: EvmRef | undefined =
    row.source === 'evm' && row.evmChainId !== null && row.evmTokenAddress && row.evmTxHash
      ? {
          chainId: row.evmChainId,
          tokenAddress: row.evmTokenAddress,
          txHash: row.evmTxHash,
          logIndex: row.evmLogIndex ?? undefined,
          from: row.evmFrom ?? undefined,
          to: row.evmTo ?? undefined,
          blockNumber: row.evmBlockNumber !== null ? Number(row.evmBlockNumber) : undefined,
        }
      : undefined

  return {
    id: row.id,
    userId: row.userId,
    idempotencyKey: row.idempotencyKey,
    direction: row.direction,
    source: row.source,
    asset: { symbol: row.assetSymbol, decimals: row.assetDecimals, amount: assetAmount },
    memo: row.memo ?? undefined,
    platformRef:
      row.source === 'platform' && row.platformRefKind
        ? { kind: row.platformRefKind, refId: row.platformRefId ?? undefined }
        : undefined,
    evmRef,
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PostgresTransactionStore extends UserTransactionStore {
  private db!: Db
  private pool!: Pool
  private readonly postgresUrl: string
  private logger: Logger
  private initialized = false

  constructor(postgresUrl: string) {
    super()
    this.postgresUrl = postgresUrl
    this.logger = makeLogger('PostgresTransactionStore')
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  protected async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')

      this.pool = new Pool({ connectionString: this.postgresUrl })
      this.db = drizzle(this.pool, { schema })

      await this.db.execute(sql`select 1`)
      this.logger.info('initialized successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to initialize: ${msg}`)
      throw err
    }
  }

  public async getById(id: UUID): Promise<UserTxRecord | null> {
    await this.ensureInitialized()

    try {
      const row = await this.db.query.userTransactions.findFirst({
        where: eq(userTransactions.id, id),
      })
      return row ? rowToRecord(row) : null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to getById id=${id}: ${msg}`)
      throw err
    }
  }

  public async getByIdempotencyKey(
    userId: UUID,
    idempotencyKey: string,
  ): Promise<UserTxRecord | null> {
    await this.ensureInitialized()

    try {
      const row = await this.db.query.userTransactions.findFirst({
        where: and(
          eq(userTransactions.userId, userId),
          eq(userTransactions.idempotencyKey, idempotencyKey),
        ),
      })
      return row ? rowToRecord(row) : null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to getByIdempotencyKey userId=${userId}, key=${idempotencyKey}: ${msg}`,
      )
      throw err
    }
  }

  public async getByEvmRef(ref: EvmRef): Promise<UserTxRecord | null> {
    await this.ensureInitialized()

    try {
      const li = ref.logIndex ?? 0

      const row = await this.db.query.userTransactions.findFirst({
        where: and(
          eq(userTransactions.source, 'evm'),
          eq(userTransactions.evmChainId, ref.chainId),
          eq(userTransactions.evmTokenAddress, normalizeAddress(ref.tokenAddress)),
          eq(userTransactions.evmTxHash, ref.txHash.toLowerCase()),
          eq(userTransactions.evmLogIndex, li),
        ),
      })

      return row ? rowToRecord(row) : null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to getByEvmRef chainId=${ref.chainId}, token=${ref.tokenAddress}, tx=${ref.txHash}: ${msg}`,
      )
      throw err
    }
  }

  public async list(filter: TxFilter, opts?: TransactionListOptions): Promise<UserTxRecord[]> {
    await this.ensureInitialized()

    try {
      const order = opts?.order ?? 'desc'
      const limit = opts?.limit ?? 50
      const offset = opts?.offset ?? 0

      const where = and(
        eq(userTransactions.userId, filter.userId),
        filter.direction ? eq(userTransactions.direction, filter.direction) : undefined,
        filter.source ? eq(userTransactions.source, filter.source) : undefined,
        filter.symbol ? eq(userTransactions.assetSymbol, filter.symbol) : undefined,
        filter.since ? gte(userTransactions.createdAt, filter.since) : undefined,
        filter.until ? lte(userTransactions.createdAt, filter.until) : undefined,
      )

      const rows = await this.db
        .select()
        .from(userTransactions)
        .where(where)
        .orderBy(
          order === 'asc' ? asc(userTransactions.createdAt) : desc(userTransactions.createdAt),
        )
        .limit(limit)
        .offset(offset)

      return rows.map(rowToRecord)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to list userId=${filter.userId}: ${msg}`)
      throw err
    }
  }

  public async getBalances(userId: UUID): Promise<BalanceView[]> {
    await this.ensureInitialized()
    return super.getBalances(userId)
  }

  protected async _createConfirmed(
    txInput: CreateUserTx,
    idempotencyKey: string,
  ): Promise<UserTxRecord> {
    await this.ensureInitialized()

    try {
      const isPlatform = txInput.source === 'platform'
      const isEvm = txInput.source === 'evm'

      const insertRow: typeof userTransactions.$inferInsert = {
        userId: txInput.userId,
        idempotencyKey,
        direction: txInput.direction,
        source: txInput.source,
        assetSymbol: txInput.asset.symbol,
        assetDecimals: txInput.asset.decimals,
        assetAmount: txInput.asset.amount,
        memo: txInput.memo ?? null,
        platformRefKind: isPlatform ? (txInput.platformRef?.kind ?? null) : null,
        platformRefId: isPlatform ? (txInput.platformRef?.refId ?? null) : null,
        evmChainId: isEvm ? (txInput.evmRef?.chainId ?? null) : null,
        evmTokenAddress: isEvm
          ? txInput.evmRef
            ? normalizeAddress(txInput.evmRef.tokenAddress)
            : null
          : null,
        evmTxHash: isEvm ? (txInput.evmRef ? txInput.evmRef.txHash.toLowerCase() : null) : null,
        evmLogIndex: isEvm ? (txInput.evmRef?.logIndex ?? 0) : null,
        evmFrom: isEvm
          ? txInput.evmRef?.from
            ? normalizeAddress(txInput.evmRef.from)
            : null
          : null,
        evmTo: isEvm ? (txInput.evmRef?.to ? normalizeAddress(txInput.evmRef.to) : null) : null,
        evmBlockNumber:
          isEvm && txInput.evmRef?.blockNumber !== undefined
            ? BigInt(txInput.evmRef.blockNumber)
            : null,
        meta: txInput.meta ?? null,
      }

      const inserted = await this.db
        .insert(userTransactions)
        .values(insertRow)
        .onConflictDoNothing()
        .returning()

      if (inserted.length > 0) {
        this.logger.trace(`Inserted tx userId=${txInput.userId} key=${idempotencyKey}`)
        return rowToRecord(inserted[0])
      }

      const existing = await this.getByIdempotencyKey(txInput.userId, idempotencyKey)
      if (existing) {
        const existingCreate: CreateUserTx = {
          userId: existing.userId,
          direction: existing.direction,
          source: existing.source,
          asset: existing.asset,
          memo: existing.memo,
          platformRef: existing.platformRef,
          evmRef: existing.evmRef,
          meta: existing.meta,
        }

        if (!txIdentityCompatible(existingCreate, txInput)) {
          throw new TxConflictError(
            `idempotencyKey conflict for userId=${txInput.userId} key=${idempotencyKey}`,
          )
        }

        return existing
      }

      throw new Error('failed to insert transaction: conflict but could not load existing row')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to create tx userId=${txInput.userId} key=${idempotencyKey}: ${msg}`,
      )
      throw err
    }
  }

  protected async _getBalances(userId: UUID): Promise<BalanceView[]> {
    await this.ensureInitialized()

    try {
      const rows = await this.db
        .select({
          symbol: userTransactions.assetSymbol,
          decimals: userTransactions.assetDecimals,
          amount: sql<string>`
            SUM(
              CASE
                WHEN ${userTransactions.direction} = 'credit' THEN ${userTransactions.assetAmount}
                ELSE -${userTransactions.assetAmount}
              END
            )
          `,
        })
        .from(userTransactions)
        .where(eq(userTransactions.userId, userId))
        .groupBy(userTransactions.assetSymbol, userTransactions.assetDecimals)

      return rows
        .map((r) => ({
          symbol: r.symbol,
          decimals: r.decimals,
          amount: (r.amount ?? '0').toString(),
        }))
        .filter((r) => r.amount !== '0')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to getBalances userId=${userId}: ${msg}`)
      throw err
    }
  }
}
