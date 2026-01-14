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
} from './transactions.js'

function now(): Date {
  return new Date()
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase()
}

function normalizeMaybeAddr(x: string | undefined): string | undefined {
  if (x === undefined) return undefined
  return x.toLowerCase()
}

function sameEvmRef(a: EvmRef, b: EvmRef): boolean {
  return (
    a.chainId === b.chainId &&
    normalizeAddress(a.tokenAddress) === normalizeAddress(b.tokenAddress) &&
    a.txHash.toLowerCase() === b.txHash.toLowerCase() &&
    (a.logIndex ?? 0) === (b.logIndex ?? 0)
  )
}

function normalizeEvmRef(ref: EvmRef): EvmRef {
  return {
    ...ref,
    tokenAddress: normalizeAddress(ref.tokenAddress),
    txHash: ref.txHash.toLowerCase(),
    logIndex: ref.logIndex ?? 0,
    from: normalizeMaybeAddr(ref.from),
    to: normalizeMaybeAddr(ref.to),
  } as EvmRef
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
    return sameEvmRef(normalizeEvmRef(existing.evmRef), normalizeEvmRef(incoming.evmRef))
  }

  if (existing.platformRef || incoming.platformRef) {
    return samePlatformRefIdentity(existing.platformRef, incoming.platformRef)
  }

  return true
}

function addDecStr(a: string, b: string): string {
  let i = a.length - 1
  let j = b.length - 1
  let carry = 0
  let out = ''
  while (i >= 0 || j >= 0 || carry) {
    const da = i >= 0 ? a.charCodeAt(i) - 48 : 0
    const db = j >= 0 ? b.charCodeAt(j) - 48 : 0
    const s = da + db + carry
    out = String(s % 10) + out
    carry = Math.floor(s / 10)
    i--
    j--
  }
  return out.replace(/^0+(?=\d)/, '')
}

function cmpDecStr(a: string, b: string): number {
  const aa = a.replace(/^0+(?=\d)/, '')
  const bb = b.replace(/^0+(?=\d)/, '')
  if (aa.length !== bb.length) return aa.length < bb.length ? -1 : 1
  if (aa === bb) return 0
  return aa < bb ? -1 : 1
}

function subDecStr(a: string, b: string): string {
  if (cmpDecStr(a, b) < 0) throw new Error('negative result in subDecStr')
  let i = a.length - 1
  let j = b.length - 1
  let borrow = 0
  let out = ''
  while (i >= 0) {
    let da = a.charCodeAt(i) - 48 - borrow
    const db = j >= 0 ? b.charCodeAt(j) - 48 : 0
    if (da < db) {
      da += 10
      borrow = 1
    } else {
      borrow = 0
    }
    out = String(da - db) + out
    i--
    j--
  }
  return out.replace(/^0+(?=\d)/, '')
}

export class InMemoryUserTransactionStore extends UserTransactionStore {
  private byId = new Map<UUID, UserTxRecord>()
  private byUserIdempo = new Map<string, UUID>()
  private byEvm = new Map<string, UUID>()
  private orderedIds: UUID[] = []
  private idCounter = 0

  protected async _createConfirmed(
    tx: CreateUserTx,
    idempotencyKey: string,
  ): Promise<UserTxRecord> {
    const userKey = this.userIdempoKey(tx.userId, idempotencyKey)
    const existingId = this.byUserIdempo.get(userKey)

    if (existingId) {
      const existing = this.byId.get(existingId)
      if (!existing) {
        this.byUserIdempo.delete(userKey)
      } else {
        const existingTx: CreateUserTx = {
          userId: existing.userId,
          direction: existing.direction,
          source: existing.source,
          asset: existing.asset,
          memo: existing.memo,
          platformRef: existing.platformRef,
          evmRef: existing.evmRef,
          meta: existing.meta,
        }

        if (!txIdentityCompatible(existingTx, tx)) {
          throw new TxConflictError(
            `idempotencyKey conflict for userId=${tx.userId} key=${idempotencyKey}`,
          )
        }

        return existing
      }
    }

    if (tx.source === 'evm' && tx.evmRef) {
      const evmKey = this.evmKey(tx.evmRef)
      const existingEvmId = this.byEvm.get(evmKey)
      if (existingEvmId) {
        const existing = this.byId.get(existingEvmId)
        if (
          existing?.evmRef &&
          sameEvmRef(normalizeEvmRef(existing.evmRef), normalizeEvmRef(tx.evmRef))
        ) {
          return existing
        }
        throw new TxConflictError(`evmRef already exists for key=${evmKey}`)
      }
    }

    const createdAt = now()
    const rec: UserTxRecord = {
      id: this.nextId(),
      idempotencyKey,
      createdAt,
      updatedAt: createdAt,
      ...tx,
    }

    this.byId.set(rec.id, rec)
    this.byUserIdempo.set(userKey, rec.id)
    this.orderedIds.push(rec.id)

    if (rec.source === 'evm' && rec.evmRef) {
      this.byEvm.set(this.evmKey(rec.evmRef), rec.id)
    }

    return rec
  }

  public async getById(id: UUID): Promise<UserTxRecord | null> {
    return this.byId.get(id) ?? null
  }

  public async getByIdempotencyKey(
    userId: UUID,
    idempotencyKey: string,
  ): Promise<UserTxRecord | null> {
    const id = this.byUserIdempo.get(this.userIdempoKey(userId, idempotencyKey))
    return id ? (this.byId.get(id) ?? null) : null
  }

  public async getByEvmRef(ref: EvmRef): Promise<UserTxRecord | null> {
    const id = this.byEvm.get(this.evmKey(ref))
    return id ? (this.byId.get(id) ?? null) : null
  }

  public async list(filter: TxFilter, opts?: TransactionListOptions): Promise<UserTxRecord[]> {
    const order = opts?.order ?? 'desc'
    const limit = opts?.limit ?? 50
    const offset = opts?.offset ?? 0

    const ids = order === 'asc' ? this.orderedIds : [...this.orderedIds].reverse()

    const out: UserTxRecord[] = []
    for (const id of ids) {
      const rec = this.byId.get(id)
      if (!rec) continue
      if (rec.userId !== filter.userId) continue
      if (filter.direction && rec.direction !== filter.direction) continue
      if (filter.source && rec.source !== filter.source) continue
      if (filter.symbol && rec.asset.symbol !== filter.symbol) continue
      if (filter.since && rec.createdAt < filter.since) continue
      if (filter.until && rec.createdAt > filter.until) continue
      out.push(rec)
    }

    return out.slice(offset, offset + limit)
  }

  protected async _getBalances(userId: UUID): Promise<BalanceView[]> {
    type Agg = { symbol: string; decimals: number; amount: string }

    const map = new Map<string, Agg>()

    for (const id of this.orderedIds) {
      const rec = this.byId.get(id)
      if (!rec || rec.userId !== userId) continue

      const key = `${rec.asset.symbol}:${rec.asset.decimals}`
      let agg = map.get(key)
      if (!agg) {
        agg = { symbol: rec.asset.symbol, decimals: rec.asset.decimals, amount: '0' }
        map.set(key, agg)
      }

      if (rec.direction === 'credit') {
        agg.amount = addDecStr(agg.amount, rec.asset.amount)
      } else {
        agg.amount = subDecStr(agg.amount, rec.asset.amount)
      }
    }

    return [...map.values()]
  }

  private userIdempoKey(userId: UUID, idempotencyKey: string): string {
    return `${userId}:${idempotencyKey}`
  }

  private evmKey(ref: EvmRef): string {
    const li = ref.logIndex ?? 0
    return `${ref.chainId}:${normalizeAddress(ref.tokenAddress)}:${ref.txHash.toLowerCase()}:${li}`
  }

  private nextId(): UUID {
    this.idCounter += 1
    return `utx_${this.idCounter.toString(10)}`
  }
}
