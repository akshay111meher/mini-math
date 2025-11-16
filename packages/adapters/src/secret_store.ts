import { SecretDataType, SecretStore } from '@mini-math/secrets'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, eq, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { makeLogger, Logger } from '@mini-math/logger'
// if you have a barrel index, you can import from '../db/schema'
// here I'll assume a dedicated file:
import * as schema from './db/schema/secretStore.js'
import { secretStore } from './db/schema/secretStore.js'

type Db = NodePgDatabase<typeof schema>

export class PostgresSecretStore extends SecretStore {
  private db!: Db
  private pool!: Pool
  private readonly postgresUrl: string
  private logger: Logger

  constructor(postgresUrl: string) {
    super()
    this.postgresUrl = postgresUrl
    this.logger = makeLogger('PostresgresSecretStore')
  }

  protected async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')

      this.pool = new Pool({
        connectionString: this.postgresUrl,
      })

      this.db = drizzle(this.pool, { schema })

      // optional connectivity check
      await this.db.execute(sql`select 1`)

      this.logger.info('initialized successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to initialize: ${msg}`)
      throw err
    }
  }

  protected async _saveSecret(record: SecretDataType): Promise<void> {
    const { userId, secretIdentifier, secretData } = record

    try {
      this.logger.debug(`Saving secret for userId=${userId}, secretIdentifier=${secretIdentifier}`)

      await this.db.transaction(async (tx) => {
        // 1) Try to update existing row
        const updated = await tx
          .update(secretStore)
          .set({ secretData })
          .where(
            and(eq(secretStore.userId, userId), eq(secretStore.secretIdentifier, secretIdentifier)),
          )
          .returning({ userId: secretStore.userId })

        // 2) If nothing updated, insert new row
        if (updated.length === 0) {
          await tx.insert(secretStore).values({
            userId,
            secretIdentifier,
            secretData,
          })
        }
      })

      this.logger.debug(`Saved secret for userId=${userId}, secretIdentifier=${secretIdentifier}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to save secret for userId=${userId}, secretIdentifier=${secretIdentifier}: ${msg}`,
      )
      throw err
    }
  }

  protected async _getSecret(
    userId: string,
    secretIdentifier: string,
  ): Promise<SecretDataType | null> {
    try {
      this.logger.debug(
        `Fetching secret for userId=${userId}, secretIdentifier=${secretIdentifier}`,
      )

      const row = await this.db.query.secretStore.findFirst({
        where: and(
          eq(secretStore.userId, userId),
          eq(secretStore.secretIdentifier, secretIdentifier),
        ),
      })

      if (!row) {
        this.logger.debug(
          `No secret found for userId=${userId}, secretIdentifier=${secretIdentifier}`,
        )
        return null
      }

      this.logger.debug(`Found secret for userId=${userId}, secretIdentifier=${secretIdentifier}`)

      return {
        userId: row.userId,
        secretIdentifier: row.secretIdentifier,
        secretData: row.secretData,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to get secret for userId=${userId}, secretIdentifier=${secretIdentifier}: ${msg}`,
      )
      throw err
    }
  }
  protected async _deleteSecret(userId: string, secretIdentifier: string): Promise<boolean> {
    try {
      this.logger.debug(
        `Deleting secret for userId=${userId}, secretIdentifier=${secretIdentifier}`,
      )

      const deleted = await this.db
        .delete(secretStore)
        .where(
          and(eq(secretStore.userId, userId), eq(secretStore.secretIdentifier, secretIdentifier)),
        )
        .returning({ userId: secretStore.userId })

      const success = deleted.length > 0

      this.logger.debug(
        `Delete secret result for userId=${userId}, secretIdentifier=${secretIdentifier}: ${success}`,
      )

      return success
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to delete secret for userId=${userId}, secretIdentifier=${secretIdentifier}: ${msg}`,
      )
      throw err
    }
  }
  protected async _listSecrets(userId: string): Promise<SecretDataType[]> {
    try {
      this.logger.debug(`Listing secrets for userId=${userId}`)

      const rows = await this.db.select().from(secretStore).where(eq(secretStore.userId, userId))

      this.logger.debug(`Found ${rows.length} secrets for userId=${userId}`)

      return rows.map((row) => ({
        userId: row.userId,
        secretIdentifier: row.secretIdentifier,
        secretData: row.secretData,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to list secrets for userId=${userId}: ${msg}`)
      throw err
    }
  }
}
