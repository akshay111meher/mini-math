import { z } from 'zod'

// --------------------
// UUID
// --------------------
export const UUIDSchema = z.string()
export type UUID = z.infer<typeof UUIDSchema>

// --------------------
// Enums / literals
// --------------------
export const TxDirectionSchema = z.enum(['credit', 'debit'])
export type TxDirection = z.infer<typeof TxDirectionSchema>

export const TxSourceSchema = z.enum(['platform', 'evm'])
export type TxSource = z.infer<typeof TxSourceSchema>

// --------------------
// MoneyAmount
// --------------------
export const MoneyAmountSchema = z.object({
  amount: z.string(),
  decimals: z.number().int().nonnegative(),
  symbol: z.string().min(1),
})
export type MoneyAmount = z.infer<typeof MoneyAmountSchema>

// --------------------
// EvmRef
// --------------------
export const EvmRefSchema = z.object({
  chainId: z.number().int(),
  tokenAddress: z.string(),
  txHash: z.string(),
  logIndex: z.number().int().nonnegative().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  blockNumber: z.number().int().nonnegative().optional(),
})
export type EvmRef = z.infer<typeof EvmRefSchema>

// --------------------
// PlatformRef
// --------------------
export const PlatformRefSchema = z.object({
  kind: z.enum(['admin_adjustment', 'reward', 'purchase', 'refund', 'other']),
  refId: z.string().optional(),
})
export type PlatformRef = z.infer<typeof PlatformRefSchema>

// --------------------
// CreateUserTx
// --------------------
export const CreateUserTxSchema = z.object({
  userId: UUIDSchema,
  direction: TxDirectionSchema,
  source: TxSourceSchema,
  asset: MoneyAmountSchema,
  memo: z.string().optional(),
  platformRef: PlatformRefSchema.optional(),
  evmRef: EvmRefSchema.optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
export type CreateUserTx = z.infer<typeof CreateUserTxSchema>

// --------------------
// UserTxRecord
// --------------------
export const UserTxRecordSchema = CreateUserTxSchema.extend({
  id: UUIDSchema,
  idempotencyKey: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type UserTxRecord = z.infer<typeof UserTxRecordSchema>

// --------------------
// Errors (classes stay as-is)
// --------------------
export class TxConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TxConflictError'
  }
}

export class TxValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TxValidationError'
  }
}

// --------------------
// ListOptions
// --------------------
export const TransactionListOptionsSchema = z.object({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  order: z.enum(['asc', 'desc']).optional(),
})
export type TransactionListOptions = z.infer<typeof TransactionListOptionsSchema>

// --------------------
// TxFilter
// --------------------
export const TxFilterSchema = z.object({
  userId: UUIDSchema,
  direction: TxDirectionSchema.optional(),
  source: TxSourceSchema.optional(),
  symbol: z.string().optional(),
  since: z.date().optional(),
  until: z.date().optional(),
})
export type TxFilter = z.infer<typeof TxFilterSchema>

// --------------------
// BalanceView
// --------------------
export const BalanceViewSchema = z.object({
  symbol: z.string().min(1),
  decimals: z.number().int().nonnegative(),
  amount: z.string(),
})
export type BalanceView = z.infer<typeof BalanceViewSchema>

export abstract class UserTransactionStore {
  public async credit(input: Omit<CreateUserTx, 'direction'>): Promise<UserTxRecord> {
    const tx: CreateUserTx = {
      ...input,
      direction: 'credit',
    }
    this.validateCreate(tx)
    const idempotencyKey = UserTransactionStore.computeIdempotencyKey(tx)
    return this._createConfirmed(tx, idempotencyKey)
  }

  public async debit(
    input: Omit<CreateUserTx, 'direction' | 'source' | 'evmRef'> & {
      platformRef: NonNullable<CreateUserTx['platformRef']>
    },
  ): Promise<UserTxRecord> {
    const tx: CreateUserTx = {
      ...input,
      direction: 'debit',
      source: 'platform',
    }
    this.validateCreate(tx)
    const idempotencyKey = UserTransactionStore.computeIdempotencyKey(tx)
    return this._createConfirmed(tx, idempotencyKey)
  }

  public abstract getById(id: UUID): Promise<UserTxRecord | null>

  public abstract getByIdempotencyKey(
    userId: UUID,
    idempotencyKey: string,
  ): Promise<UserTxRecord | null>

  public abstract getByEvmRef(ref: EvmRef): Promise<UserTxRecord | null>

  public abstract list(filter: TxFilter, opts?: TransactionListOptions): Promise<UserTxRecord[]>

  public async getBalances(userId: UUID): Promise<BalanceView[]> {
    return this._getBalances(userId)
  }

  protected abstract _createConfirmed(
    tx: CreateUserTx,
    idempotencyKey: string,
  ): Promise<UserTxRecord>

  protected abstract _getBalances(userId: UUID): Promise<BalanceView[]>

  protected validateCreate(tx: CreateUserTx): void {
    if (!tx.userId) throw new TxValidationError('userId is required')

    if (tx.direction !== 'credit' && tx.direction !== 'debit') {
      throw new TxValidationError("direction must be 'credit' or 'debit'")
    }

    if (tx.source !== 'platform' && tx.source !== 'evm') {
      throw new TxValidationError("source must be 'platform' or 'evm'")
    }

    if (tx.direction === 'debit' && tx.source !== 'platform') {
      throw new TxValidationError("debits must have source='platform'")
    }

    if (!tx.asset?.symbol) throw new TxValidationError('asset.symbol is required')
    if (!Number.isInteger(tx.asset.decimals) || tx.asset.decimals < 0) {
      throw new TxValidationError('asset.decimals must be a non-negative integer')
    }
    if (!/^\d+$/.test(tx.asset.amount)) {
      throw new TxValidationError('asset.amount must be a non-negative integer string')
    }
    if (tx.asset.amount === '0') {
      throw new TxValidationError('asset.amount must be > 0')
    }

    if (tx.source === 'platform') {
      if (!tx.platformRef?.kind) {
        throw new TxValidationError('platformRef.kind is required for platform tx')
      }
      if (tx.evmRef) {
        throw new TxValidationError('evmRef must be empty for platform tx')
      }
    }

    if (tx.source === 'evm') {
      if (!tx.evmRef) throw new TxValidationError('evmRef is required for evm tx')
      if (!/^0x[a-fA-F0-9]{64}$/.test(tx.evmRef.txHash)) {
        throw new TxValidationError('evmRef.txHash must look like a 0x…32-byte hash')
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(tx.evmRef.tokenAddress)) {
        throw new TxValidationError('evmRef.tokenAddress must look like a 0x…20-byte address')
      }
      if (tx.platformRef) {
        throw new TxValidationError('platformRef must be empty for evm tx')
      }
    }
  }

  public static computeIdempotencyKey(tx: CreateUserTx): string {
    if (tx.source === 'platform') {
      const kind = tx.platformRef?.kind ?? 'other'
      const refId = tx.platformRef?.refId ?? ''
      const sym = tx.asset.symbol
      const amt = tx.asset.amount
      const dec = String(tx.asset.decimals)
      const memo = tx.memo ?? ''
      return `platform:${tx.userId}:${kind}:${refId}:${sym}:${dec}:${amt}:${memo}`
    }

    const e = tx.evmRef!
    const li = e.logIndex ?? 0
    return `evm:${tx.userId}:${e.chainId}:${e.tokenAddress}:${e.txHash}:${li}`
  }
}
