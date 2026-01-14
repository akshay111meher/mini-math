// schema/secretStore.ts
import { pgTable, text } from 'drizzle-orm/pg-core'

export const kvs = pgTable('key_value_store', {
  key: text('key').notNull().primaryKey(),
  value: text('value').notNull(),
})
