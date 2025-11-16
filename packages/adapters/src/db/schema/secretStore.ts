// schema/secretStore.ts
import { pgTable, text, primaryKey, index } from 'drizzle-orm/pg-core'

export const secretStore = pgTable(
  'secrets',
  {
    userId: text('user_id').notNull(),
    secretIdentifier: text('secret_identifier').notNull(),
    secretData: text('secret_data').notNull(),
  },
  (table) => [
    {
      // ensure (userId, secretIdentifier) pair is unique
      pk: primaryKey({ columns: [table.userId, table.secretIdentifier] }),

      // fast lookup by user
      userIdIdx: index('secrets_user_id_idx').on(table.userId),

      // fast lookup by identifier (if you ever need it)
      secretIdentifierIdx: index('secrets_secret_identifier_idx').on(table.secretIdentifier),
    },
  ],
)
