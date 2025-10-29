import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { openapiDoc } from './swagger.js'

extendZodWithOpenApi(z)

const app = express()
app.use(express.json())

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc))

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`API on http://localhost:${port}  |  Docs: http://localhost:${port}/docs`)
})
