import { ListOptions, ListResult } from '@mini-math/utils'
import { z } from 'zod'

// --------------------------------------------
// Types / Schemas
// --------------------------------------------

export const EvmPaymentAddressSchema = z
  .string()
  .min(1, 'evm_payment_address is required')
  // loosen/remove regex if you support non-standard formats
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
  unifiedCredits: z.number().optional(),
  cdpAccountCredits: z.number().optional(),
})

export type CreditDelta = z.infer<typeof CreditDeltaSchema>

export const GrantCreditDeltaSchema = CreditDeltaSchema.extend({ userId: z.string() })
export type GrantCreditDeltaSchemaType = z.infer<typeof GrantCreditDeltaSchema>

export type EvmPaymentAddressResolver = (userId: string) => string | Promise<string>

export abstract class UserStore {
  private initialized = false
  private readonly resolveEvmPaymentAddress: EvmPaymentAddressResolver

  constructor(resolveEvmPaymentAddress: EvmPaymentAddressResolver) {
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

  // --------------------------------------------
  // PUBLIC API (NO evm_payment_address input)
  // --------------------------------------------

  public async create(userId: string, delta?: CreditDelta): Promise<boolean> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)
    return this._create(userId, evm_payment_address, delta)
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

  public async adjustCredits(userId: string, delta: CreditDelta): Promise<UserRecord> {
    await this.ensureInitialized()
    const evm_payment_address = await this.deriveEvmPaymentAddress(userId)
    return this._adjustCredits(userId, evm_payment_address, delta)
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

  /**
   * Listing all rows is still possible; but note:
   * since address is derived from userId, in many systems you'll effectively have 1 row per user.
   */
  public async list(options?: ListOptions): Promise<ListResult<UserRecord>> {
    await this.ensureInitialized()
    return this._list(options)
  }

  /**
   * Since evm_payment_address is indexed and you explicitly wanted it searchable,
   * this is a nice public API even though other methods derive it.
   */
  public async getByPaymentAddress(evm_payment_address: string): Promise<UserRecord | undefined> {
    await this.ensureInitialized()
    const addr = EvmPaymentAddressSchema.parse(evm_payment_address)
    return this._getByPaymentAddress(addr)
  }

  // --------------------------------------------
  // PROTECTED HOOKS (DB is keyed by both)
  // --------------------------------------------

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

  protected abstract _adjustCredits(
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

  protected abstract _getByPaymentAddress(
    evm_payment_address: EvmPaymentAddress,
  ): Promise<UserRecord | undefined>
}

import { getAddress, Wallet, solidityPackedKeccak256 } from 'ethers'

const isEvmAddress = (s: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(s)

export function makePaymentResolver(seed: string): EvmPaymentAddressResolver {
  if (!seed) throw new Error('seed is required')

  return (userId: string) => {
    if (!isEvmAddress(userId)) {
      throw new Error(`userId must be an EVM address, got: ${userId}`)
    }

    const normalized = getAddress(userId).toLowerCase()

    let h = solidityPackedKeccak256(['string', 'address'], [seed, normalized])
    if (BigInt(h) === 0n) {
      h = solidityPackedKeccak256(['string', 'address', 'string'], [seed, normalized, ':retry1'])
      if (BigInt(h) === 0n)
        throw new Error('Derived private key is zero; bad seed/userId combination')
    }

    const wallet = new Wallet(h)
    return wallet.address
  }
}
