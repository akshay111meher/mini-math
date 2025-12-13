import { pgTable, text, integer, primaryKey } from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    userId: text('userId').notNull(),
    storageCredits: integer('storageCredits').notNull().default(0),
    executionCredits: integer('executionCredits').notNull().default(0),
    cdpAccountCredits: integer('cdpAccountCredits').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId], name: 'users_pk' })],
)
