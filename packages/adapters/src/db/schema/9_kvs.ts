// schema/secretStore.ts
import { pgTable, text, primaryKey, index } from 'drizzle-orm/pg-core'

export const kvs = pgTable(
  'keyValueStore',
  {
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.key] })],
)
