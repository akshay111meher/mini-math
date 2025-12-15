import { OpenAPIRegistry, OpenApiGeneratorV3, RouteConfig } from '@asteasolutions/zod-to-openapi'

import {
  AuthRouter,
  CdpRouter,
  DevRouter,
  ImageRouter,
  RbacRouter,
  SecretRouter,
  WorkflowRouter,
} from '../routers/index.js'

const registry = new OpenAPIRegistry()

const allDocs: RouteConfig[] = [
  ...AuthRouter.doc,
  ...CdpRouter.doc,
  ...DevRouter.doc,
  ...ImageRouter.doc,
  ...RbacRouter.doc,
  ...SecretRouter.doc,
  ...WorkflowRouter.doc,
]

for (let index = 0; index < allDocs.length; index++) {
  const element = allDocs[index]
  if (element) {
    registry.registerPath(element)
  } else {
    throw new Error('Invalid swagger document received')
  }
}

const generator = new OpenApiGeneratorV3(registry.definitions)

export const openapiDoc = generator.generateDocument({
  openapi: '3.0.0',
  info: { title: 'API', version: '1.0.0' },
})
// ;(openapiDoc.components ??= {}).securitySchemes = {
//   ...(openapiDoc.components?.securitySchemes ?? {}),
//   cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sid' },
// }
