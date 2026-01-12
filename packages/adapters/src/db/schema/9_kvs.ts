// schema/secretStore.ts
import { pgTable, text, primaryKey, index } from 'drizzle-orm/pg-core'

export const kvs = pgTable('key_value_store', {
  key: text('key').notNull().primaryKey(),
  value: text('value').notNull(),
})
