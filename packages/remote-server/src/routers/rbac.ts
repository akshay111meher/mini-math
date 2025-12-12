import { RequestHandler, Router } from 'express'
import { requireAuth, validateBody } from '../middlewares/index.js'
import {
  GrantCreditDeltaSchema,
  GrantOrRevokeRoleSchema,
  Role,
  RoleStore,
  UserStore,
} from '@mini-math/rbac'
import { handleGrantCredits, handleGrantRole, handleRevokeRole } from 'src/rbac/index.js'
export function create(
  mustHaveOneOfTheRole: (roles: Role[]) => RequestHandler,
  roleStore: RoleStore,
  userStore: UserStore,
): Router {
  const router = Router()

  router.post(
    '/grantRole',
    requireAuth(),
    validateBody(GrantOrRevokeRoleSchema),
    handleGrantRole(roleStore),
  )

  router.post(
    '/grantCredits',
    requireAuth(),
    mustHaveOneOfTheRole([Role.PlatformOwner]),
    validateBody(GrantCreditDeltaSchema),
    handleGrantCredits(userStore),
  )
  router.post(
    '/revokeRole',
    requireAuth(),
    validateBody(GrantOrRevokeRoleSchema),
    handleRevokeRole(roleStore),
  )

  return router
}
