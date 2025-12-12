import { pgTable, text, jsonb, index, primaryKey } from 'drizzle-orm/pg-core'
import type { WorkflowCoreType } from '@mini-math/workflow'

export const workflowImages = pgTable(
  'workflow_images',
  {
    ownerId: text('owner_id').notNull(), // FK part 1 -> user_roles.user_id

    workflowName: text('workflow_name').notNull(),
    image: jsonb('image').$type<WorkflowCoreType>().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.workflowName],
      name: 'workflow_images_pk',
    }),

    // index on owner only
    index('workflow_images_owner_idx').on(table.ownerId),

    // index on owner + workflowName
    index('workflow_images_owner_workflow_idx').on(table.ownerId, table.workflowName),
  ],
)
