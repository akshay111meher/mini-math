import { SecretDataType, SecretStore } from '@mini-math/secrets'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, eq, sql } from 'drizzle-orm'
import { Pool } from 'pg'

// if you have a barrel index, you can import from '../db/schema'
// here I'll assume a dedicated file:
import * as schema from './db/schema/secretStore.js'
import { secretStore } from './db/schema/secretStore.js'

type Db = NodePgDatabase<typeof schema>

export class PostgresSecretStore extends SecretStore {
  private db!: Db
  private pool!: Pool
  private readonly postgresUrl: string

  constructor(postgresUrl: string) {
    super()
    this.postgresUrl = postgresUrl
  }

  protected async onInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.postgresUrl,
    })

    this.db = drizzle(this.pool, { schema })

    // optional connectivity check
    await this.db.execute(sql`select 1`)
  }
  async saveSecret(record: SecretDataType): Promise<void> {
    const { userId, secretIdentifier, secretData } = record

    await this.db
      .insert(secretStore)
      .values({
        userId,
        secretIdentifier,
        secretData,
      })
      .onConflictDoUpdate({
        target: [secretStore.userId, secretStore.secretIdentifier],
        set: {
          secretData,
        },
      })
  }
  async getSecret(userId: string, secretIdentifier: string): Promise<SecretDataType | null> {
    const row = await this.db.query.secretStore.findFirst({
      where: and(
        eq(secretStore.userId, userId),
        eq(secretStore.secretIdentifier, secretIdentifier),
      ),
    })

    if (!row) return null

    return {
      userId: row.userId,
      secretIdentifier: row.secretIdentifier,
      secretData: row.secretData,
    }
  }
  async deleteSecret(userId: string, secretIdentifier: string): Promise<boolean> {
    const deleted = await this.db
      .delete(secretStore)
      .where(
        and(eq(secretStore.userId, userId), eq(secretStore.secretIdentifier, secretIdentifier)),
      )
      .returning({ userId: secretStore.userId })

    return deleted.length > 0
  }
  async listSecrets(userId: string): Promise<SecretDataType[]> {
    const rows = await this.db.select().from(secretStore).where(eq(secretStore.userId, userId))

    return rows.map((row) => ({
      userId: row.userId,
      secretIdentifier: row.secretIdentifier,
      secretData: row.secretData,
    }))
  }
}
