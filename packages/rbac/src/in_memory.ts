import { RoleStore } from './roleStore.js'
import { Role } from './roles.js'

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
