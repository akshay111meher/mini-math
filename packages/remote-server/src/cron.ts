import { RuntimeStore } from '@mini-math/runtime'
import {
  NextLinkedWorkflowType,
  Workflow,
  WorkflowCoreType,
  WorkflowRefType,
  WorkflowStore,
} from '@mini-math/workflow'
import { RequestHandler } from 'express'
import { CronedWorkflowCoreType } from './swagger/cron.js'
import { v4 as uuidv4 } from 'uuid'
import { IQueue } from '@mini-math/queue'
import { NodeFactoryType } from '@mini-math/compiler'

export function handleCronJob(
  workflowStore: WorkflowStore,
  runtimeStore: RuntimeStore,
  queue: IQueue<WorkflowRefType>,
  nodeFactory: NodeFactoryType,
): RequestHandler {
  return async (req, res) => {
    const cronJobDescription = req.body as CronedWorkflowCoreType
    const user = req.user.address

    const workflowPayloads: {
      id: string
      workflowCore: WorkflowCoreType
      user: string
      previousLinkedWorkflow?: WorkflowRefType
      nextLinkedWorkflow?: NextLinkedWorkflowType
    }[] = []

    const runtimePayloads: { id: string }[] = []

    const maxRuns = cronJobDescription.intervalSchedule.maxRuns
    const everyMs = cronJobDescription.intervalSchedule.everyMs

    // create all workflows first
    for (let index = 0; index < maxRuns; index++) {
      const id = uuidv4()
      runtimePayloads.push({ id })
      workflowPayloads.push({
        id,
        workflowCore: cronJobDescription.workflowCore,
        user,
      })
    }

    // stitch links
    for (let index = 0; index < workflowPayloads.length; index++) {
      const current = workflowPayloads[index]

      if (index > 0) {
        current.previousLinkedWorkflow = workflowPayloads[index - 1].id
      }

      if (index < workflowPayloads.length - 1) {
        current.nextLinkedWorkflow = [
          {
            id: workflowPayloads[index + 1].id,
            executionDelay: everyMs,
          },
        ]
      }
    }

    if (runtimePayloads.length != workflowPayloads.length) {
      return res.status(400).json({
        success: false,
        message: 'Failed created cron schedule',
      })
    }

    for (let index = 0; index < runtimePayloads.length; index++) {
      const runtimePayload = runtimePayloads[index]
      const workflowPayload = workflowPayloads[index]

      const { previousLinkedWorkflow, nextLinkedWorkflow } = workflowPayload

      const options: {
        previousLinkedWorkflow?: WorkflowRefType
        nextLinkedWorkflow?: NextLinkedWorkflowType
      } = {}

      if (previousLinkedWorkflow) {
        options.previousLinkedWorkflow = previousLinkedWorkflow
      }

      if (nextLinkedWorkflow) {
        options.nextLinkedWorkflow = nextLinkedWorkflow
      }

      const tempWfRef = Workflow.syntaxCheck(
        { id: workflowPayload.id, ...workflowPayload.workflowCore, owner: workflowPayload.user },
        nodeFactory,
      )
      if (tempWfRef.hasExternalInput()) {
        return res.status(400).json({
          success: false,
          message: 'cron jobs with external inputs are not supported right now',
        })
      }
      if (Object.keys(options).length > 0) {
        await workflowStore.create(
          workflowPayload.id,
          workflowPayload.workflowCore,
          workflowPayload.user,
          options,
        )
      } else {
        await workflowStore.create(
          workflowPayload.id,
          workflowPayload.workflowCore,
          workflowPayload.user,
        )
      }

      await runtimeStore.create(runtimePayload.id)
    }

    const firstWorkflowId = workflowPayloads[0].id
    const { startAt } = cronJobDescription.intervalSchedule

    if (startAt && startAt > Date.now()) {
      const delay = startAt - Date.now()
      await queue.enqueue(firstWorkflowId, delay)
    } else {
      await queue.enqueue(firstWorkflowId)
    }

    return res.status(200).json({
      success: true,
      message: 'created cron successfully. Sending init workflow id in data',
      data: workflowPayloads[0].id,
    })
  }
}
