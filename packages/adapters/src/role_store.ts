import { Role, RoleStore } from '@mini-math/rbac'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, sql, and } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from './db/schema/rbac.js'
import { userRoles } from './db/schema/rbac.js'
type Db = NodePgDatabase<typeof schema>

export class PostgresRoleStore extends RoleStore {
  private db!: Db
  private pool!: Pool

  private readonly postgresUrl: string

  constructor(
    postgresUrl: string,
    private init_platform_owner: string,
  ) {
    super()
    this.postgresUrl = postgresUrl
  }

  protected async onInit(): Promise<void> {
    // 1. Create PG pool
    this.pool = new Pool({
      connectionString: this.postgresUrl,
    })

    // 2. Wrap pool in Drizzle
    this.db = drizzle(this.pool, {
      schema,
    })

    // 3. Optional sanity check – ensure DB is reachable
    await this.db.execute(sql`select 1`)
    const currentRoles = await this._getRolesImpl(this.init_platform_owner)
    if (!currentRoles.includes(Role.PlatformOwner)) {
      await this._addRoleImpl(this.init_platform_owner, Role.PlatformOwner)
    }
  }

  protected async _getRolesImpl(userId: string): Promise<Role[]> {
    const rows = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))

    return rows.map((r) => r.role as Role)
  }
  protected async _setRolesImpl(userId: string, roles: Role[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // clear existing
      await tx.delete(userRoles).where(eq(userRoles.userId, userId))

      if (roles.length === 0) return

      // insert new
      await tx.insert(userRoles).values(
        roles.map((role) => ({
          userId,
          role,
        })),
      )
    })
  }
  protected async _addRoleImpl(userId: string, role: Role): Promise<void> {
    await this.db
      .insert(userRoles)
      .values({ userId, role })
      // in case it already exists (composite PK), don't throw
      .onConflictDoNothing()
  }
  protected async _removeRoleImpl(userId: string, role: Role): Promise<void> {
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
  }
  protected async _hasRoleImpl(userId: string, role: Role): Promise<boolean> {
    const rows = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
      .limit(1)

    return rows.length > 0
  }
  protected async _clearRolesImpl(userId: string): Promise<void> {
    await this.db.delete(userRoles).where(eq(userRoles.userId, userId))
  }
}
