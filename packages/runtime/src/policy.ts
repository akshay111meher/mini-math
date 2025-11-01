import { z } from 'zod'
import { WORKFLOW_CONSTANTS } from '@mini-math/utils'

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

export const PoliciesSchema = z
  .object({
    defaultTimeoutMs: z.coerce.number().int().min(1).default(WORKFLOW_CONSTANTS.DEFAULT_TIMEOUT_MS),
    maxParallel: z.coerce.number().int().min(1).default(WORKFLOW_CONSTANTS.MAX_PARALLEL),
  })
  .openapi('Policies')

export type PoliciesDef = z.infer<typeof PoliciesSchema>
