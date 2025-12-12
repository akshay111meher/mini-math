import { RoleStore } from './roleStore.js'
import { Role } from './roles.js'
import { UserStore, type UserRecord, type CreditDelta } from './userStore.js'

import { ListOptions, ListResult } from '@mini-math/utils'
export class InMemoryRoleStore extends RoleStore {
  constructor(initPlatformOwner: string) {
    super()
    this.rolesByUser = new Map()
    this._addRoleImpl(initPlatformOwner, Role.PlatformOwner)
  }
  private rolesByUser = new Map<string, Set<Role>>()

  protected async onInit(): Promise<void> {
    return
  }

  protected async _getRolesImpl(userId: string): Promise<Role[]> {
    const set = this.rolesByUser.get(userId)
    return set ? Array.from(set) : []
  }

  protected async _setRolesImpl(userId: string, roles: Role[]): Promise<void> {
    this.rolesByUser.set(userId, new Set(roles))
  }

  protected async _addRoleImpl(userId: string, role: Role): Promise<void> {
    let set = this.rolesByUser.get(userId)
    if (!set) {
      set = new Set<Role>()
      this.rolesByUser.set(userId, set)
    }
    set.add(role)
  }

  protected async _removeRoleImpl(userId: string, role: Role): Promise<void> {
    const set = this.rolesByUser.get(userId)
    if (!set) return

    set.delete(role)
    if (set.size === 0) {
      this.rolesByUser.delete(userId)
    }
  }

  protected async _hasRoleImpl(userId: string, role: Role): Promise<boolean> {
    const set = this.rolesByUser.get(userId)
    return set ? set.has(role) : false
  }

  protected async _clearRolesImpl(userId: string): Promise<void> {
    this.rolesByUser.delete(userId)
  }
}

export class InMemoryUserStore extends UserStore {
  private store = new Map<string, UserRecord>()

  protected async initialize(): Promise<void> {
    // nothing to do
  }

  protected async _create(
    userId: string,
    storageCredits: number,
    executionCredits: number,
    cdpAccountCredits: number,
  ): Promise<boolean> {
    if (this.store.has(userId)) return false

    this.store.set(userId, {
      userId,
      storageCredits,
      executionCredits,
      cdpAccountCredits,
    })

    return true
  }

  protected async _get(userId: string): Promise<UserRecord | undefined> {
    const u = this.store.get(userId)
    return u ? { ...u } : undefined
  }

  protected async _upsert(
    userId: string,
    patch: Partial<Omit<UserRecord, 'userId'>>,
  ): Promise<UserRecord> {
    const existing = this.store.get(userId) ?? {
      userId,
      storageCredits: 0,
      executionCredits: 0,
      cdpAccountCredits: 0,
    }

    const updated: UserRecord = {
      ...existing,
      ...patch,
    }

    this.store.set(userId, updated)
    return { ...updated }
  }

  protected async _adjustCredits(userId: string, delta: CreditDelta): Promise<UserRecord> {
    const existing = this.store.get(userId) ?? {
      userId,
      storageCredits: 0,
      executionCredits: 0,
      cdpAccountCredits: 0,
    }

    const updated: UserRecord = {
      userId,
      storageCredits: existing.storageCredits + (delta.storageCredits ?? 0),
      executionCredits: existing.executionCredits + (delta.executionCredits ?? 0),
      cdpAccountCredits: existing.cdpAccountCredits + (delta.cdpAccountCredits ?? 0),
    }

    this.store.set(userId, updated)
    return { ...updated }
  }

  protected async _exists(userId: string): Promise<boolean> {
    return this.store.has(userId)
  }

  protected async _delete(userId: string): Promise<boolean> {
    return this.store.delete(userId)
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
}
