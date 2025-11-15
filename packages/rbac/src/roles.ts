import { z } from 'zod'

// 1) Typed roles (enum)
export enum Role {
  PlatformOwner = 'PlatformOwner',
  Developer = 'Developer',
}

export const GrantOrRevokeRoleSchema = z.object({
  role: z.enum(Role),
  user: z.string(),
})

export type GrantOrRevokeRoleType = z.infer<typeof GrantOrRevokeRoleSchema>

export const getRoleAdmin = (role: Role): Role | undefined => {
  if (role === Role.Developer) {
    return Role.PlatformOwner
  }
  return undefined
}
