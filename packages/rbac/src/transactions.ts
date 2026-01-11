export type UUID = string

export type TxDirection = 'credit' | 'debit'
export type TxSource = 'platform' | 'evm'

export interface MoneyAmount {
  amount: string
  decimals: number
  symbol: string
}

export interface EvmRef {
  chainId: number
  tokenAddress: string
  txHash: string
  logIndex?: number
  from?: string
  to?: string
  blockNumber?: number
}

export interface CreateUserTx {
  userId: UUID
  direction: TxDirection
  source: TxSource
  asset: MoneyAmount
  memo?: string
  platformRef?: {
    kind: 'admin_adjustment' | 'reward' | 'purchase' | 'refund' | 'other'
    refId?: string
  }
  evmRef?: EvmRef
  meta?: Record<string, unknown>
}

export interface UserTxRecord extends CreateUserTx {
  id: UUID
  idempotencyKey: string
  createdAt: Date
  updatedAt: Date
}

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

export interface ListOptions {
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

export interface TxFilter {
  userId: UUID
  direction?: TxDirection
  source?: TxSource
  symbol?: string
  since?: Date
  until?: Date
}

export interface BalanceView {
  symbol: string
  decimals: number
  amount: string
}

export abstract class UserTransactionStore {
  public async credit(input: Omit<CreateUserTx, 'direction'>): Promise<UserTxRecord> {
    const tx: CreateUserTx = {
      ...input,
      direction: 'credit',
    }
    this.validateCreate(tx)
    const idempotencyKey = this.computeIdempotencyKey(tx)
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
    const idempotencyKey = this.computeIdempotencyKey(tx)
    return this._createConfirmed(tx, idempotencyKey)
  }

  public abstract getById(id: UUID): Promise<UserTxRecord | null>

  public abstract getByIdempotencyKey(
    userId: UUID,
    idempotencyKey: string,
  ): Promise<UserTxRecord | null>

  public abstract getByEvmRef(ref: EvmRef): Promise<UserTxRecord | null>

  public abstract list(filter: TxFilter, opts?: ListOptions): Promise<UserTxRecord[]>

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

  protected computeIdempotencyKey(tx: CreateUserTx): string {
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
