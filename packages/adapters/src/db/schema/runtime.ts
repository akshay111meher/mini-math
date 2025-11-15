// schema/runtime.ts
import { pgTable, text, boolean, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Table for RuntimeSchema (id + runtime state fields)
export const runtimes = pgTable('runtimes', {
  // primary key corresponding to RuntimeRef
  id: text('id').primaryKey(),

  // queue: string[] with default []
  queue: jsonb('queue')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  // visited: string[] with default []
  visited: jsonb('visited')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  // current: nullable string, default null
  current: text('current'),

  // finished: boolean with default false
  finished: boolean('finished').notNull().default(false),
})
