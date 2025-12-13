import { Router, RequestHandler } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { Role } from '@mini-math/rbac'
import { validateBody } from '../middlewares/validate.js'
import { Workflow, WorkflowSchema, WorkflowStore } from '@mini-math/workflow'
import { createNewWorkflow, deleteWorkflowIfExists } from '../middlewares/workflow.js'
import { createNewRuntime, deleteRuntimeIfExists } from '../middlewares/runtime.js'
import { RuntimeStore } from '@mini-math/runtime'
import { Logger } from '@mini-math/logger'
import { SecretStore } from '@mini-math/secrets'
import { NodeFactoryType } from '@mini-math/compiler'
import { WORKFLOW_CONSTANTS } from '@mini-math/utils'

export function create(
  mustHaveOneOfTheRole: (roles: Role[]) => RequestHandler,
  workflowStore: WorkflowStore,
  runtimeStore: RuntimeStore,
  secretStore: SecretStore,
  nodeFactory: NodeFactoryType,
  logger: Logger,
): Router {
  const router = Router()

  router.post(
    '/run',
    requireAuth(),
    mustHaveOneOfTheRole([Role.Developer]),
    validateBody(WorkflowSchema),
    deleteWorkflowIfExists(workflowStore),
    deleteRuntimeIfExists(runtimeStore),
    createNewWorkflow(workflowStore),
    createNewRuntime(runtimeStore),
    async (req, res) => {
      logger.trace('direct workflow request received')
      const runtime = req.runtime
      const secrets = await secretStore.listSecrets(req.user.address)
      logger.trace('fetched secrets')
      let workflow = new Workflow(req.body, nodeFactory, secrets, runtime)
      logger.trace(`Received workflow: ${workflow.id()}`)

      if (workflow.isFinished()) {
        return res
          .status(409)
          .json({ success: false, message: `Workflow ID: ${workflow.id()} already fullfilled` })
      }

      if (workflow.hasExternalInput()) {
        return res.status(400).json({
          success: false,
          message: `Workflow ID: ${workflow.id()} with external input can''t be run, they must be loaded and then initiated/scheduled`,
        })
      }

      while (!workflow.isFinished()) {
        const info = await workflow.clock(BigInt(WORKFLOW_CONSTANTS.MAX_EXECUTION_UNITS_PER_CLOCK))
        logger.trace(`Clocked workflow: ${workflow.id()}`)
        logger.trace(JSON.stringify(info))

        const [wf, rt] = workflow.serialize()
        logger.trace(JSON.stringify(wf))
        logger.trace(JSON.stringify(rt))

        if (info.status == 'error') {
          return res.status(400).json({
            status: info.status,
            error: info.code,
            data: { workflow: wf, runtime: rt },
          })
        }

        if (info.status == 'terminated') {
          return res.status(410).json({
            status: info.status,
            data: { workflow: wf, runtime: rt, node: info.node, exec: info.exec },
          })
        }

        if (info.status == 'insufficient_credit') {
          return res.status(403).json({
            status: info.status,
            data: { workflow: wf, runtime: rt },
          })
        }

        await workflowStore.update(workflow.id(), wf)
        await runtimeStore.update(workflow.id(), rt)
        workflow = new Workflow(wf, nodeFactory, secrets, rt)
      }

      logger.trace(`Workflow finished: ${workflow.id()}`)
      const [wf] = workflow.serialize()
      await workflowStore.delete(workflow.id())
      await runtimeStore.delete(workflow.id())
      return res.json({ status: true, data: wf })
    },
  )

  router.post('/clock', async (req, res) => {
    return res.status(400).json({ success: false, message: 'revoked' })
  })

  return router
}
