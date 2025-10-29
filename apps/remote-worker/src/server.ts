import express, { Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { openapiDoc } from './swagger.js'
import { validateBody } from './validate.js'
import { Workflow, WorkflowSchema } from '@mini-math/workflow'
import { NodeFactory } from '@mini-math/compiler'

extendZodWithOpenApi(z)

const app = express()
app.use(express.json())

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc))

app.post('/run', validateBody(WorkflowSchema), async (req: Request, res: Response) => {
  const nodeFactory = new NodeFactory()
  let workflow = new Workflow(req.body, nodeFactory)

  while (!workflow.isFinished()) {
    const info = await workflow.clock()

    console.log(JSON.stringify(info, null, 2))

    workflow = new Workflow(workflow.serialize(), nodeFactory)
  }

  return res.json({ success: true, data: workflow.serialize() })
})

app.post('/validate', validateBody(WorkflowSchema), async (req: Request, res: Response) => {
  return res.json({ success: true, data: req.body })
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`API on http://localhost:${port}  |  Docs: http://localhost:${port}/docs`)
})
