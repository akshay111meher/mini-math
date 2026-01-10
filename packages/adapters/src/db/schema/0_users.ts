import { pgTable, text, integer, primaryKey, index } from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    userId: text('userId').notNull(),

    evm_payment_address: text('evm_payment_address').notNull(),

    unifiedCredits: integer('unifiedCredits').notNull().default(0),

    cdpAccountCredits: integer('cdpAccountCredits').notNull().default(0),
  },
  (table) => [
    // Composite primary key
    primaryKey({
      columns: [table.userId, table.evm_payment_address],
      name: 'users_pk',
    }),

    // Fast lookups by payment address
    index('users_evm_payment_address_idx').on(table.evm_payment_address),
  ],
)
