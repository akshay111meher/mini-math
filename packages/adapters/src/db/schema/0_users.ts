import { pgTable, text, integer, primaryKey } from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    userId: text('userId').notNull(),
    storageCredits: integer('storageCredits').default(0),
    executionCredits: integer('executionCredits').default(0),
    cdpAccountCredits: integer('cdpAccountCredits').default(0),
  },
  (table) => [primaryKey({ columns: [table.userId], name: 'users_pk' })],
)
