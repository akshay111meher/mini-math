import { ListOptions, ListResult } from '@mini-math/utils'
import { z } from 'zod'
import { Wallet, getAddress, solidityPackedKeccak256 } from 'ethers'
import { TxSource, UserTransactionStore } from './transactions.js'

export const EvmPaymentAddressSchema = z
  .string()
  .min(1, 'evm_payment_address is required')
  .regex(/^0x[a-fA-F0-9]{40}$/, 'evm_payment_address must be a 0x-prefixed 20-byte hex address')

export type EvmPaymentAddress = z.infer<typeof EvmPaymentAddressSchema>

export const UserRecordSchema = z.object({
  userId: z.string(),
  evm_payment_address: EvmPaymentAddressSchema,
  unifiedCredits: z.number(),
  cdpAccountCredits: z.number(),
})
export type UserRecord = z.infer<typeof UserRecordSchema>

export const CreditDeltaSchema = z.object({
  unifiedCredits: z.number().positive().optional(),
  cdpAccountCredits: z.number().positive().optional(),
})
export type CreditDelta = z.infer<typeof CreditDeltaSchema>

export const GrantCreditDeltaSchema = CreditDeltaSchema.extend({ userId: z.string() })
export type GrantCreditDeltaSchemaType = z.infer<typeof GrantCreditDeltaSchema>

export type EvmPaymentAddressResolver = (userId: string) => string | Promise<string>
export type EvmWallet = (userId: string) => Wallet | Promise<Wallet>

export type AdjustCreditsOptions = {
  kind?: 'admin_adjustment' | 'reward' | 'purchase' | 'refund' | 'other'
  refId?: string
  memo?: string
  meta?: Record<string, unknown>
}

function toAmountString(n: number, name: string): string {
  if (!Number.isFinite(n)) throw new Error(`invalid ${name}: ${n}`)
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got: ${n}`)
  if (n <= 0) throw new Error(`${name} must be > 0, got: ${n}`)
  return String(n)
}

function toNonNegativeInt(n: number | undefined, name: string): number {
  if (n === undefined) return 0
  if (!Number.isFinite(n)) throw new Error(`invalid ${name}: ${n}`)
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got: ${n}`)
  if (n < 0) throw new Error(`${name} must be >= 0, got: ${n}`)
  return n
}

export abstract class UserStore {
  private initialized = false
  private readonly resolveEvmPaymentAddress: EvmPaymentAddressResolver
  protected readonly user_transaction_history: UserTransactionStore

  constructor(
    user_transaction_history: UserTransactionStore,
    resolveEvmPaymentAddress: EvmPaymentAddressResolver,
  ) {
    this.user_transaction_history = user_transaction_history
    this.resolveEvmPaymentAddress = resolveEvmPaymentAddress
  }

  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  protected async deriveEvmPaymentAddress(userId: string): Promise<EvmPaymentAddress> {
    const addr = await this.resolveEvmPaymentAddress(userId)
    return EvmPaymentAddressSchema.parse(addr)
  }

  protected async atomic<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  public async create(
    userId: string,
    delta?: CreditDelta,
    opts?: AdjustCreditsOptions,
  ): Promise<boolean> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)

    return this.atomic(async () => {
      const ok = await this._create(userId, evm_payment_address, delta)
      if (!ok) return false

      if (delta) {
        const u = toNonNegativeInt(delta.unifiedCredits, 'unifiedCredits')
        const c = toNonNegativeInt(delta.cdpAccountCredits, 'cdpAccountCredits')

        if (u > 0) {
          await this.user_transaction_history.credit({
            userId,
            asset: {
              symbol: 'UNIFIED_CREDIT',
              decimals: 0,
              amount: toAmountString(u, 'unifiedCredits'),
            },
            memo: opts?.memo,
            platformRef: {
              kind: opts?.kind ?? 'other',
              refId: opts?.refId ?? `create:${userId}:unified`,
            },
            meta: opts?.meta,
            source: 'platform',
          })
        }

        if (c > 0) {
          await this.user_transaction_history.credit({
            userId,
            asset: {
              symbol: 'CDP_ACCOUNT_CREDIT',
              decimals: 0,
              amount: toAmountString(c, 'cdpAccountCredits'),
            },
            memo: opts?.memo,
            platformRef: {
              kind: opts?.kind ?? 'other',
              refId: opts?.refId ?? `create:${userId}:cdp`,
            },
            meta: opts?.meta,
            source: 'platform',
          })
        }
      }

      return true
    })
  }

  public async get(userId: string): Promise<UserRecord | undefined> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)
    return this._get(userId, evm_payment_address)
  }

  public async upsert(
    userId: string,
    patch: Partial<Omit<UserRecord, 'userId' | 'evm_payment_address'>>,
  ): Promise<UserRecord> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)
    return this._upsert(userId, evm_payment_address, patch)
  }

  public async increaseCredits(
    userId: string,
    source: TxSource,
    delta: CreditDelta,
    opts?: AdjustCreditsOptions,
  ): Promise<UserRecord> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)

    const u = toNonNegativeInt(delta.unifiedCredits, 'unifiedCredits')
    const c = toNonNegativeInt(delta.cdpAccountCredits, 'cdpAccountCredits')

    const inc: CreditDelta = {
      unifiedCredits: u > 0 ? u : undefined,
      cdpAccountCredits: c > 0 ? c : undefined,
    }

    return this.atomic(async () => {
      const after = await this._increaseCredits(userId, evm_payment_address, inc)

      const kind = opts?.kind ?? 'other'
      const refBase = opts?.refId ?? `increase:${userId}`
      const memo = opts?.memo
      const meta = opts?.meta

      if (u > 0) {
        await this.user_transaction_history.credit({
          userId,
          asset: {
            symbol: 'UNIFIED_CREDIT',
            decimals: 0,
            amount: toAmountString(u, 'unifiedCredits'),
          },
          memo,
          platformRef: { kind, refId: `${refBase}:unified` },
          meta,
          source,
        })
      }

      if (c > 0) {
        await this.user_transaction_history.credit({
          userId,
          asset: {
            symbol: 'CDP_ACCOUNT_CREDIT',
            decimals: 0,
            amount: toAmountString(c, 'cdpAccountCredits'),
          },
          memo,
          platformRef: { kind, refId: `${refBase}:cdp` },
          meta,
          source,
        })
      }

      return after
    })
  }

  public async reduceCredits(
    userId: string,
    delta: CreditDelta,
    opts?: AdjustCreditsOptions,
  ): Promise<UserRecord> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)

    const u = toNonNegativeInt(delta.unifiedCredits, 'unifiedCredits')
    const c = toNonNegativeInt(delta.cdpAccountCredits, 'cdpAccountCredits')

    const dec: CreditDelta = {
      unifiedCredits: u > 0 ? u : undefined,
      cdpAccountCredits: c > 0 ? c : undefined,
    }

    return this.atomic(async () => {
      const after = await this._reduceCredits(userId, evm_payment_address, dec)

      const kind = opts?.kind ?? 'other'
      const refBase = opts?.refId ?? `reduce:${userId}`
      const memo = opts?.memo
      const meta = opts?.meta

      if (u > 0) {
        await this.user_transaction_history.debit({
          userId,
          asset: {
            symbol: 'UNIFIED_CREDIT',
            decimals: 0,
            amount: toAmountString(u, 'unifiedCredits'),
          },
          memo,
          platformRef: { kind, refId: `${refBase}:unified` },
          meta: { ...meta, kind, refId: `${refBase}:unified` },
        })
      }

      if (c > 0) {
        await this.user_transaction_history.debit({
          userId,
          asset: {
            symbol: 'CDP_ACCOUNT_CREDIT',
            decimals: 0,
            amount: toAmountString(c, 'cdpAccountCredits'),
          },
          memo,
          platformRef: { kind, refId: `${refBase}:cdp` },
          meta: { ...meta, kind, refId: `${refBase}:cdp` },
        })
      }

      return after
    })
  }

  public async exists(userId: string): Promise<boolean> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)
    return this._exists(userId, evm_payment_address)
  }

  public async delete(userId: string): Promise<boolean> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)
    return this._delete(userId, evm_payment_address)
  }

  public async list(options?: ListOptions): Promise<ListResult<UserRecord>> {
    await this.ensureInitialized()
    return this._list(options)
  }

  public async getUserusingPaymentAddress(paymentAddress: string): Promise<UserRecord | undefined> {
    await this.ensureInitialized()
    const addr = EvmPaymentAddressSchema.parse(paymentAddress)
    return this._getUserusingPaymentAddress(addr)
  }

  /**
   * 2) getUsersUsingPaymentsAddresses(paymentAddress[]) -> data[]
   */
  public async getUsersUsingPaymentsAddresses(paymentAddresses: string[]): Promise<UserRecord[]> {
    await this.ensureInitialized()
    const addrs = paymentAddresses.map((a) => EvmPaymentAddressSchema.parse(a))
    return this._getUsersUsingPaymentsAddresses(addrs)
  }

  protected abstract initialize(): Promise<void>

  protected abstract _create(
    userId: string,
    evm_payment_address: EvmPaymentAddress,
    delta?: CreditDelta,
  ): Promise<boolean>

  protected abstract _get(
    userId: string,
    evm_payment_address: EvmPaymentAddress,
  ): Promise<UserRecord | undefined>

  protected abstract _upsert(
    userId: string,
    evm_payment_address: EvmPaymentAddress,
    patch: Partial<Omit<UserRecord, 'userId' | 'evm_payment_address'>>,
  ): Promise<UserRecord>

  protected abstract _increaseCredits(
    userId: string,
    evm_payment_address: EvmPaymentAddress,
    delta: CreditDelta,
  ): Promise<UserRecord>

  protected abstract _reduceCredits(
    userId: string,
    evm_payment_address: EvmPaymentAddress,
    delta: CreditDelta,
  ): Promise<UserRecord>

  protected abstract _exists(
    userId: string,
    evm_payment_address: EvmPaymentAddress,
  ): Promise<boolean>

  protected abstract _delete(
    userId: string,
    evm_payment_address: EvmPaymentAddress,
  ): Promise<boolean>

  protected abstract _list(options?: ListOptions): Promise<ListResult<UserRecord>>

  protected abstract _getUserusingPaymentAddress(
    paymentAddress: EvmPaymentAddress,
  ): Promise<UserRecord | undefined>

  protected abstract _getUsersUsingPaymentsAddresses(
    paymentAddresses: EvmPaymentAddress[],
  ): Promise<UserRecord[]>
}

const isEvmAddress = (s: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(s)

export function makePaymentResolverWallet(seed: string): EvmWallet {
  if (!seed) throw new Error('seed is required')

  return (userId: string) => {
    if (!isEvmAddress(userId)) {
      throw new Error(`userId must be an EVM address, got: ${userId}`)
    }

    const normalized = getAddress(userId).toLowerCase()

    let h = solidityPackedKeccak256(['string', 'address'], [seed, normalized])
    if (BigInt(h) === 0n) {
      h = solidityPackedKeccak256(['string', 'address', 'string'], [seed, normalized, ':retry1'])
      if (BigInt(h) === 0n) {
        throw new Error('Derived private key is zero; bad seed/userId combination')
      }
    }

    return new Wallet(h)
  }
}

export function makePaymentResolver(seed: string): EvmPaymentAddressResolver {
  const walletResolver = makePaymentResolverWallet(seed)
  return async (userId: string) => {
    const w = await walletResolver(userId)
    return w.address
  }
}
