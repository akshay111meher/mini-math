import { Role, RoleStore } from '@mini-math/rbac'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, sql, and } from 'drizzle-orm'
import { Pool } from 'pg'

import * as schema from './db/schema/rbac.js'
import { userRoles } from './db/schema/rbac.js'
import { Logger, makeLogger } from '@mini-math/logger'

type Db = NodePgDatabase<typeof schema>

export class PostgresRoleStore extends RoleStore {
  private db!: Db
  private pool!: Pool
  private readonly postgresUrl: string
  private logger: Logger

  constructor(
    postgresUrl: string,
    private init_platform_owner: string,
  ) {
    super()
    this.postgresUrl = postgresUrl
    this.logger = makeLogger('PostgresRoleStore')
  }

  private handleError(method: string, err: unknown, context?: Record<string, unknown>): never {
    this.logger.error(
      JSON.stringify({
        err,
        method,
        ...context,
      }) + ' operation failed',
    )
    throw err
  }

  protected async onInit(): Promise<void> {
    try {
      this.logger.debug('Initializing')
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

      this.logger.info('PostgresRoleStore initialized successfully')
    } catch (err) {
      this.handleError('onInit', err, {
        postgresUrl: this.postgresUrl,
        init_platform_owner: this.init_platform_owner,
      })
    }
  }

  protected async _getRolesImpl(userId: string): Promise<Role[]> {
    try {
      const rows = await this.db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))

      return rows.map((r) => r.role as Role)
    } catch (err) {
      this.handleError('_getRolesImpl', err, { userId })
    }
  }

  protected async _setRolesImpl(userId: string, roles: Role[]): Promise<void> {
    try {
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
    } catch (err) {
      this.handleError('_setRolesImpl', err, { userId, roles })
    }
  }

  protected async _addRoleImpl(userId: string, role: Role): Promise<void> {
    try {
      await this.db
        .insert(userRoles)
        .values({ userId, role })
        // in case it already exists (composite PK), don't throw
        .onConflictDoNothing()
    } catch (err) {
      this.handleError('_addRoleImpl', err, { userId, role })
    }
  }

  protected async _removeRoleImpl(userId: string, role: Role): Promise<void> {
    try {
      await this.db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
    } catch (err) {
      this.handleError('_removeRoleImpl', err, { userId, role })
    }
  }

  protected async _hasRoleImpl(userId: string, role: Role): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
        .limit(1)

      return rows.length > 0
    } catch (err) {
      this.handleError('_hasRoleImpl', err, { userId, role })
    }
  }

  protected async _clearRolesImpl(userId: string): Promise<void> {
    try {
      await this.db.delete(userRoles).where(eq(userRoles.userId, userId))
    } catch (err) {
      this.handleError('_clearRolesImpl', err, { userId })
    }
  }
}
