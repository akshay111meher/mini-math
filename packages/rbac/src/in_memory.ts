import { RoleStore } from './roleStore.js'
import { Role } from './roles.js'
import { UserStore, type UserRecord, type CreditDelta } from './userStore.js'
import { getAddress } from 'viem'

import { ListOptions, ListResult } from '@mini-math/utils'
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
  // Keyed by composite PK: (userId, evm_payment_address)
  private store = new Map<string, UserRecord>()

  constructor() {
    // Derivation: "address" is just userId (as you requested)
    super((userId) => userId)
  }

  protected async initialize(): Promise<void> {
    // nothing to do
  }

  private key(userId: string, evm_payment_address: string): string {
    return `${userId}|${evm_payment_address}`
  }

  protected async _create(
    userId: string,
    evm_payment_address: string,
    delta?: CreditDelta,
  ): Promise<boolean> {
    const k = this.key(userId, evm_payment_address)
    if (this.store.has(k)) return false

    this.store.set(k, {
      userId,
      evm_payment_address,
      unifiedCredits: delta?.unifiedCredits ?? 0,
      cdpAccountCredits: delta?.cdpAccountCredits ?? 0,
    })

    return true
  }

  protected async _get(
    userId: string,
    evm_payment_address: string,
  ): Promise<UserRecord | undefined> {
    const u = this.store.get(this.key(userId, evm_payment_address))
    return u ? { ...u } : undefined
  }

  protected async _upsert(
    userId: string,
    evm_payment_address: string,
    patch: Partial<Omit<UserRecord, 'userId' | 'evm_payment_address'>>,
  ): Promise<UserRecord> {
    const k = this.key(userId, evm_payment_address)

    const existing =
      this.store.get(k) ??
      ({
        userId,
        evm_payment_address,
        unifiedCredits: 0,
        cdpAccountCredits: 0,
      } satisfies UserRecord)

    // Patch only touches credit fields; keep keys fixed.
    const updated: UserRecord = {
      userId,
      evm_payment_address,
      unifiedCredits: patch.unifiedCredits ?? existing.unifiedCredits,
      cdpAccountCredits: patch.cdpAccountCredits ?? existing.cdpAccountCredits,
    }

    this.store.set(k, updated)
    return { ...updated }
  }

  protected async _adjustCredits(
    userId: string,
    evm_payment_address: string,
    delta: CreditDelta,
  ): Promise<UserRecord> {
    const k = this.key(userId, evm_payment_address)

    const existing =
      this.store.get(k) ??
      ({
        userId,
        evm_payment_address,
        unifiedCredits: 0,
        cdpAccountCredits: 0,
      } satisfies UserRecord)

    const dUnified = delta.unifiedCredits ?? 0
    const dCdp = delta.cdpAccountCredits ?? 0

    const updated: UserRecord = {
      userId,
      evm_payment_address,
      unifiedCredits: existing.unifiedCredits + dUnified,
      cdpAccountCredits: existing.cdpAccountCredits + dCdp,
    }

    this.store.set(k, updated)
    return { ...updated }
  }

  protected async _exists(userId: string, evm_payment_address: string): Promise<boolean> {
    return this.store.has(this.key(userId, evm_payment_address))
  }

  protected async _delete(userId: string, evm_payment_address: string): Promise<boolean> {
    return this.store.delete(this.key(userId, evm_payment_address))
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

  protected async _getByPaymentAddress(
    evm_payment_address: string,
  ): Promise<UserRecord | undefined> {
    // Linear scan is fine for in-memory; DB will use the index.
    for (const u of this.store.values()) {
      if (u.evm_payment_address === evm_payment_address) return { ...u }
    }
    return undefined
  }
}
