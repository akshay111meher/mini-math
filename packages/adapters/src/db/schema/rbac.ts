import { pgTable, text, index, primaryKey, pgEnum } from 'drizzle-orm/pg-core'

// Postgres enum based on your Role TS enum
export const roleEnum = pgEnum('role', ['PlatformOwner', 'Developer'])

export const userRoles = pgTable(
  'user_roles',
  {
    userId: text('user_id').notNull(),
    role: roleEnum('role').notNull(),
  },
  (table) => [
    {
      // composite primary key so the same role isn't duplicated for a user
      pk: primaryKey({ columns: [table.userId, table.role] }),

      // index to quickly find all roles for a user
      userIdIdx: index('user_roles_user_id_idx').on(table.userId),
    },
  ],
)
