import { pgTable, text, index, primaryKey } from 'drizzle-orm/pg-core'

export const cdpAccounts = pgTable(
  'cdp_accounts',
  {
    userId: text('user_id').notNull(),
    accountName: text('account_name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.accountName] }),

    index('cdp_account_user_id_idx').on(table.userId),
  ],
)
