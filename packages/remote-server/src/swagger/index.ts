import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { validate } from './validate.js'
import { compile } from './compile.js'
import { run } from './run.js'
import { externalInput, fetch, load } from './load.js'
import { clock } from './clock.js'
import { initiate, schedule } from './initiate.js'
import { logout, me, nonce, verify } from './auth.js'
import { grantRole, revokeRole, grantCredits } from './rbac.js'
import { fetchAllSecretIdentifiers, fetchSecret, removeSecret, storeSecret } from './secrets.js'
import { cron } from './cron.js'
import {
  storeImage,
  existImage,
  deleteImage,
  listImages,
  countImages,
  updateImage,
} from './image.js'
import {
  createAccount,
  getAccount,
  getTokenBalances,
  requestFaucet,
  exportAccount,
  fetchAccountNames,
} from './cdp.js'

export { IntervalScheduleSchema, CronedWorkflowCoreSchema } from './cron.js'
export { ExternalInputSchema } from './load.js'
export { ID } from './validate.js'
export { ScheduleWorkflowPayload } from './initiate.js'
export { StoreWorkflowImageSchema } from './image.js'

const registry = new OpenAPIRegistry()

registry.registerPath(validate)
registry.registerPath(compile)
registry.registerPath(run)
registry.registerPath(load)
registry.registerPath(clock)
registry.registerPath(initiate)
registry.registerPath(schedule)
registry.registerPath(fetch)
registry.registerPath(nonce)
registry.registerPath(verify)
registry.registerPath(logout)
registry.registerPath(me)
registry.registerPath(grantRole)
registry.registerPath(revokeRole)
registry.registerPath(storeSecret)
registry.registerPath(removeSecret)
registry.registerPath(externalInput)
registry.registerPath(fetchSecret)
registry.registerPath(fetchAllSecretIdentifiers)
registry.registerPath(cron)
registry.registerPath(storeImage)
registry.registerPath(existImage)
registry.registerPath(deleteImage)
registry.registerPath(listImages)
registry.registerPath(countImages)
registry.registerPath(updateImage)
registry.registerPath(grantCredits)
registry.registerPath(createAccount)
registry.registerPath(getAccount)
registry.registerPath(getTokenBalances)
registry.registerPath(requestFaucet)
registry.registerPath(exportAccount)
registry.registerPath(fetchAccountNames)

const generator = new OpenApiGeneratorV3(registry.definitions)

export const openapiDoc = generator.generateDocument({
  openapi: '3.0.0',
  info: { title: 'API', version: '1.0.0' },
})
// ;(openapiDoc.components ??= {}).securitySchemes = {
//   ...(openapiDoc.components?.securitySchemes ?? {}),
//   cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sid' },
// }
