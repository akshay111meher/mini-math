import { pgTable, text, jsonb, index, primaryKey } from 'drizzle-orm/pg-core'
import type { WorkflowCoreType } from '@mini-math/workflow'

export const workflowImages = pgTable(
  'workflow_images',
  {
    ownerId: text('owner_id').notNull(), // FK part 1 -> user_roles.user_id

    // New required identifier (primary key part 2)
    imageId: text('image_id').notNull(),

    // Optional metadata (NOT part of identity)
    workflowName: text('workflow_name'),

    image: jsonb('image').$type<WorkflowCoreType>().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.imageId],
      name: 'workflow_images_pk',
    }),

    // index on owner only (fast list/count per owner)
    index('workflow_images_owner_idx').on(table.ownerId),

    // index on owner + imageId (often redundant w/ PK, but kept if you want explicit name)
    index('workflow_images_owner_image_idx').on(table.ownerId, table.imageId),

    // optional: lookup/filter by workflowName for an owner (since it's not unique anymore)
    index('workflow_images_owner_workflow_idx').on(table.ownerId, table.workflowName),
  ],
)
