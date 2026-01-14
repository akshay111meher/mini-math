import { RoleStore } from './roleStore.js'
import { Role } from './roles.js'
import { UserStore, type UserRecord, type CreditDelta } from './userStore.js'
import { getAddress } from 'viem'

import { ListOptions, ListResult } from '@mini-math/utils'
import { InMemoryUserTransactionStore } from './in_memory_transactions.js'
import { UserTransactionStore } from './transactions.js'

export class InMemoryRoleStore extends RoleStore {
  constructor(initPlatformOwner: string) {
    super()
    this.rolesByUser = new Map()
    this._addRoleImpl(getAddress(initPlatformOwner), Role.PlatformOwner)
  }
  private rolesByUser = new Map<string, Set<Role>>()

  protected async onInit(): Promise<void> {
    return
  }

  protected async _getRolesImpl(userId: string): Promise<Role[]> {
    const set = this.rolesByUser.get(getAddress(userId))
    return set ? Array.from(set) : []
  }

  protected async _setRolesImpl(userId: string, roles: Role[]): Promise<void> {
    this.rolesByUser.set(getAddress(userId), new Set(roles))
  }

  protected async _addRoleImpl(userId: string, role: Role): Promise<void> {
    const normalizedUserId = getAddress(userId)
    let set = this.rolesByUser.get(normalizedUserId)
    if (!set) {
      set = new Set<Role>()
      this.rolesByUser.set(normalizedUserId, set)
    }
    set.add(role)
  }

  protected async _removeRoleImpl(userId: string, role: Role): Promise<void> {
    const normalizedUserId = getAddress(userId)
    const set = this.rolesByUser.get(normalizedUserId)
    if (!set) return

    set.delete(role)
    if (set.size === 0) {
      this.rolesByUser.delete(normalizedUserId)
    }
  }

  protected async _hasRoleImpl(userId: string, role: Role): Promise<boolean> {
    const set = this.rolesByUser.get(getAddress(userId))
    return set ? set.has(role) : false
  }

  protected async _clearRolesImpl(userId: string): Promise<void> {
    this.rolesByUser.delete(getAddress(userId))
  }
}

export class InMemoryUserStore extends UserStore {
  private store = new Map<string, UserRecord>()

  constructor(txStore: UserTransactionStore) {
    super(txStore, (userId) => userId)
  }

  protected async initialize(): Promise<void> {}

  private norm(s: string): string {
    return s.toLowerCase()
  }

  private key(userId: string): string {
    return this.norm(userId)
  }

  private assertAddressMatches(existing: UserRecord, evm_payment_address: string): void {
    const a = this.norm(existing.evm_payment_address)
    const b = this.norm(evm_payment_address)
    if (a !== b) {
      throw new Error(
        `evm_payment_address mismatch for userId=${existing.userId} (have=${existing.evm_payment_address}, got=${evm_payment_address})`,
      )
    }
  }

  protected async _create(
    userId: string,
    evm_payment_address: string,
    delta?: CreditDelta,
  ): Promise<boolean> {
    const k = this.key(userId)
    if (this.store.has(k)) return false

    const u = delta?.unifiedCredits ?? 0
    const c = delta?.cdpAccountCredits ?? 0
    if (u < 0) throw new Error('create: unifiedCredits must be >= 0')
    if (c < 0) throw new Error('create: cdpAccountCredits must be >= 0')

    this.store.set(k, {
      userId,
      evm_payment_address,
      unifiedCredits: u,
      cdpAccountCredits: c,
    })

    return true
  }

  protected async _get(
    userId: string,
    evm_payment_address: string,
  ): Promise<UserRecord | undefined> {
    const existing = this.store.get(this.key(userId))
    if (!existing) return undefined
    this.assertAddressMatches(existing, evm_payment_address)
    return { ...existing }
  }

  protected async _upsert(
    userId: string,
    evm_payment_address: string,
    patch: Partial<Omit<UserRecord, 'userId' | 'evm_payment_address'>>,
  ): Promise<UserRecord> {
    const k = this.key(userId)

    const existing =
      this.store.get(k) ??
      ({
        userId,
        evm_payment_address,
        unifiedCredits: 0,
        cdpAccountCredits: 0,
      } satisfies UserRecord)

    if (this.store.has(k)) {
      this.assertAddressMatches(existing, evm_payment_address)
    }

    const nextUnified = patch.unifiedCredits ?? existing.unifiedCredits
    const nextCdp = patch.cdpAccountCredits ?? existing.cdpAccountCredits

    if (!Number.isFinite(nextUnified) || !Number.isInteger(nextUnified)) {
      throw new Error('upsert: unifiedCredits must be an integer')
    }
    if (!Number.isFinite(nextCdp) || !Number.isInteger(nextCdp)) {
      throw new Error('upsert: cdpAccountCredits must be an integer')
    }
    if (nextUnified < 0) throw new Error('upsert: unifiedCredits must be >= 0')
    if (nextCdp < 0) throw new Error('upsert: cdpAccountCredits must be >= 0')

    const updated: UserRecord = {
      userId,
      evm_payment_address,
      unifiedCredits: nextUnified,
      cdpAccountCredits: nextCdp,
    }

    this.store.set(k, updated)
    return { ...updated }
  }

  protected async _increaseCredits(
    userId: string,
    evm_payment_address: string,
    delta: CreditDelta,
  ): Promise<UserRecord> {
    const k = this.key(userId)

    const existing = this.store.get(k)
    if (!existing) throw new Error(`user not found: ${userId}`)
    this.assertAddressMatches(existing, evm_payment_address)

    const du = delta.unifiedCredits ?? 0
    const dc = delta.cdpAccountCredits ?? 0

    if (!Number.isFinite(du) || !Number.isInteger(du) || du < 0) {
      throw new Error('increaseCredits: unifiedCredits must be an integer >= 0')
    }
    if (!Number.isFinite(dc) || !Number.isInteger(dc) || dc < 0) {
      throw new Error('increaseCredits: cdpAccountCredits must be an integer >= 0')
    }

    const updated: UserRecord = {
      userId,
      evm_payment_address: existing.evm_payment_address,
      unifiedCredits: existing.unifiedCredits + du,
      cdpAccountCredits: existing.cdpAccountCredits + dc,
    }

    this.store.set(k, updated)
    return { ...updated }
  }

  protected async _reduceCredits(
    userId: string,
    evm_payment_address: string,
    delta: CreditDelta,
  ): Promise<UserRecord> {
    const k = this.key(userId)

    const existing = this.store.get(k)
    if (!existing) throw new Error(`user not found: ${userId}`)
    this.assertAddressMatches(existing, evm_payment_address)

    const du = delta.unifiedCredits ?? 0
    const dc = delta.cdpAccountCredits ?? 0

    if (!Number.isFinite(du) || !Number.isInteger(du) || du < 0) {
      throw new Error('reduceCredits: unifiedCredits must be an integer >= 0')
    }
    if (!Number.isFinite(dc) || !Number.isInteger(dc) || dc < 0) {
      throw new Error('reduceCredits: cdpAccountCredits must be an integer >= 0')
    }

    if (existing.unifiedCredits < du) {
      throw new Error(
        `reduceCredits: insufficient unifiedCredits (have=${existing.unifiedCredits}, need=${du})`,
      )
    }
    if (existing.cdpAccountCredits < dc) {
      throw new Error(
        `reduceCredits: insufficient cdpAccountCredits (have=${existing.cdpAccountCredits}, need=${dc})`,
      )
    }

    const updated: UserRecord = {
      userId,
      evm_payment_address: existing.evm_payment_address,
      unifiedCredits: existing.unifiedCredits - du,
      cdpAccountCredits: existing.cdpAccountCredits - dc,
    }

    this.store.set(k, updated)
    return { ...updated }
  }

  protected async _exists(userId: string, evm_payment_address: string): Promise<boolean> {
    const existing = this.store.get(this.key(userId))
    if (!existing) return false
    this.assertAddressMatches(existing, evm_payment_address)
    return true
  }

  protected async _delete(userId: string, evm_payment_address: string): Promise<boolean> {
    const existing = this.store.get(this.key(userId))
    if (!existing) return false
    this.assertAddressMatches(existing, evm_payment_address)
    return this.store.delete(this.key(userId))
  }

  protected async _list(options?: ListOptions): Promise<ListResult<UserRecord>> {
    const all = Array.from(this.store.values())

    const cursor = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0
    const limit = options?.limit ?? all.length

    const items = all.slice(cursor, cursor + limit).map((u) => ({ ...u }))
    const nextIndex = cursor + limit
    const nextCursor = nextIndex < all.length ? String(nextIndex) : undefined

    return { items, nextCursor }
  }

  private async _getByPaymentAddress(evm_payment_address: string): Promise<UserRecord | undefined> {
    const needle = this.norm(evm_payment_address)
    for (const u of this.store.values()) {
      if (this.norm(u.evm_payment_address) === needle) return { ...u }
    }
    return undefined
  }

  protected async _getUserusingPaymentAddress(
    paymentAddress: string,
  ): Promise<UserRecord | undefined> {
    return this._getByPaymentAddress(paymentAddress)
  }

  protected async _getUsersUsingPaymentsAddresses(
    paymentAddresses: string[],
  ): Promise<UserRecord[]> {
    // normalize + dedupe input
    const needles = new Set(paymentAddresses.map((a) => this.norm(a)))
    if (needles.size === 0) return []

    const out: UserRecord[] = []
    for (const u of this.store.values()) {
      if (needles.has(this.norm(u.evm_payment_address))) {
        out.push({ ...u })
      }
    }
    return out
  }
}
