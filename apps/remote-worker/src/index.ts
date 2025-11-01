import { z } from 'zod'
import express, { Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { Workflow, WorkflowSchema } from '@mini-math/workflow'
import { NodeFactory } from '@mini-math/compiler'
import { RuntimeStore } from '@mini-math/runtime'

import { openapiDoc } from './swagger.js'
import { validateBody } from './validate.js'

import { makeLogger } from '@mini-math/logger'
const logger = makeLogger('RemoteServer')
extendZodWithOpenApi(z)

const runtimeStore = new RuntimeStore()
const app = express()
app.use(express.json())

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc))

app.post('/run', validateBody(WorkflowSchema), async function (req: Request, res: Response) {
  const nodeFactory = new NodeFactory()
  let { runtime, status, message } = runtimeStore.get(req.body.id) // TODO: fix this req.body.id

  if (!status || !runtime) {
    return res.status(501).json({ success: true, message })
  }

  let workflow = new Workflow(req.body, nodeFactory, runtime.serialize())
  logger.trace(`Received workflow: ${workflow.id()}`)

  if (workflow.isFinished()) {
    return res
      .status(409)
      .json({ success: false, message: `Workflow ID: ${workflow.id()} already fullfilled` })
  }

  while (!workflow.isFinished()) {
    const info = await workflow.clock()
    logger.debug(`Clocked workflow: ${workflow.id()}`)
    logger.trace(JSON.stringify(info))

    const [wf, rt] = workflow.serialize()
    logger.trace(JSON.stringify([wf]))
    logger.trace(JSON.stringify([rt]))

    runtimeStore.update(workflow.id(), rt)

    workflow = new Workflow(wf, nodeFactory, rt)
  }

  logger.trace(`Workflow finished: ${workflow.id()}`)

  const [wf] = workflow.serialize()
  return res.json({ success: true, data: wf })
})

app.post('/validate', validateBody(WorkflowSchema), async (req: Request, res: Response) => {
  return res.json({ success: true, data: req.body })
})

app.post('/compile', validateBody(WorkflowSchema), async (req: Request, res: Response) => {
  try {
    const nodeFactory = new NodeFactory()
    const workflow = new Workflow(req.body, nodeFactory)
    workflow.bfs()
    return res.json({ success: true, data: workflow.serialize() })
  } catch (error) {
    return res.status(400).json({ success: false, error: String(error) })
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`API on http://localhost:${port}  |  Docs: http://localhost:${port}/docs`)
})
