// db/schema/workflows.ts
import { pgTable, varchar, text, jsonb, timestamp, index, boolean } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import type { NodeDefType, EdgeDefType, NodeRefType } from '@mini-math/nodes'
import type { ExpectingInputForType, ExternalInputStorageType, LockType } from '@mini-math/workflow'

export const workflows = pgTable(
  'workflows',
  {
    id: text('id').primaryKey(), // or varchar/uuid depending on WorkflowRef

    // name: optional string, max 255
    name: varchar('name', { length: 255 }),

    // version: string with max length 2
    version: varchar('version', { length: 2 }).notNull(),

    // complex fields as JSONB
    nodes: jsonb('nodes').$type<NodeDefType[]>().notNull(),
    edges: jsonb('edges').$type<EdgeDefType[]>().notNull(),
    entry: jsonb('entry').$type<NodeRefType>().notNull(),
    globalState: jsonb('global_state')
      .$type<unknown | null>()
      .default(sql`null`),

    // lock: optional JSONB blob that matches LockType
    lock: jsonb('lock')
      .$type<LockType | null>()
      .default(sql`null`),

    inProgress: boolean('in_progress').notNull().default(false),
    isInitiated: boolean('is_initiated').notNull().default(false),
    expectingInputFor: jsonb('expectingInputFor')
      .$type<ExpectingInputForType | null>()
      .default(sql`null`),

    externalInputStorage: jsonb('externalInputStorage')
      .$type<ExternalInputStorageType | null>()
      .default(sql`null`),

    // optional meta
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    owner: varchar('owner', { length: 255 }).notNull(),
  },
  (table) => [
    {
      // index on name
      nameIdx: index('workflows_name_idx').on(table.name),

      // index on version
      versionIdx: index('workflows_version_idx').on(table.version),

      // composite index if you’ll often filter by both name + version
      nameVersionIdx: index('workflows_name_version_idx').on(table.name, table.version),

      // index on owner
      ownerIdx: index('workflows_owner_idx').on(table.owner),
    },
  ],
)
