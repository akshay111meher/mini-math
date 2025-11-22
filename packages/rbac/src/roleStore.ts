import { Role, GrantOrRevokeRoleType } from './roles.js'

export abstract class RoleStore {
  protected initialized = false

  // Call once at bootstrap (or lazily, if you want to be fancy)
  private async init(): Promise<void> {
    if (this.initialized) return
    await this.onInit()
    this.initialized = true
  }
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }

  // ----- Public API (never overridden by subclasses) -----

  async getRoles(userId: string): Promise<Role[]> {
    await this.ensureInitialized()
    return this._getRolesImpl(userId)
  }

  async addRoleBySchema(body: GrantOrRevokeRoleType): Promise<void> {
    await this.ensureInitialized()
    const _hasRole = await this._hasRoleImpl(body.user, body.role)
    if (!_hasRole) {
      await this._addRoleImpl(body.user, body.role)
    }
  }

  async setRoles(userId: string, roles: Role[]): Promise<void> {
    await this.ensureInitialized()
    await this._setRolesImpl(userId, roles)
  }

  async addRole(userId: string, role: Role): Promise<void> {
    await this.ensureInitialized()
    await this._addRoleImpl(userId, role)
  }

  async removeRoleBySchema(body: GrantOrRevokeRoleType): Promise<void> {
    await this.ensureInitialized()
    await this._removeRoleImpl(body.user, body.role)
  }

  async removeRole(userId: string, role: Role): Promise<void> {
    await this.ensureInitialized()
    await this._removeRoleImpl(userId, role)
  }

  async hasRole(userId: string, role: Role): Promise<boolean> {
    await this.ensureInitialized()
    return this._hasRoleImpl(userId, role)
  }

  async clearRoles(userId: string): Promise<void> {
    await this.ensureInitialized()
    await this._clearRolesImpl(userId)
  }

  // ----- Storage-specific hooks (subclasses override these) -----

  protected abstract onInit(): Promise<void>
  protected abstract _getRolesImpl(userId: string): Promise<Role[]>
  protected abstract _setRolesImpl(userId: string, roles: Role[]): Promise<void>
  protected abstract _addRoleImpl(userId: string, role: Role): Promise<void>
  protected abstract _removeRoleImpl(userId: string, role: Role): Promise<void>
  protected abstract _hasRoleImpl(userId: string, role: Role): Promise<boolean>
  protected abstract _clearRolesImpl(userId: string): Promise<void>
}
