import { z } from 'zod'
import {
  NodeDef,
  NodeDefType,
  EdgeDef,
  ExecutionResult,
  NodeRef,
  ExternalInputId,
  ExternalInputData,
} from '@mini-math/nodes'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

export const WorkflowRef = z.string().min(16)
export type WorkflowRefType = z.infer<typeof WorkflowRef>

export const Lock = z.object({ lockedBy: z.string(), lockedAt: z.number() }).openapi('Lock Details')
export type LockType = z.infer<typeof Lock>

export const WorkflowCore = z
  .object({
    name: z.string().max(255, 'Name must be at most 255 characters').optional(),
    version: z.string().min(1).max(2).openapi('Workflow Version'),
    nodes: z.array(NodeDef).min(1).openapi('List of nodes in the workflow'),
    edges: z.array(EdgeDef).openapi('Internode connections'),
    entry: NodeRef,
    globalState: z.unknown().optional(),
  })
  .openapi('WorkflowCore')

export type WorkflowCoreType = z.infer<typeof WorkflowCore>
const WorkflowOwnerRef = z.string()

export const ExternalInputStorage = z.record(NodeRef, z.record(ExternalInputId, ExternalInputData))
export type ExternalInputStorageType = z.infer<typeof ExternalInputStorage>

export const ExpectingInputFor = z.object({ node: NodeRef, inputId: ExternalInputId })
export type ExpectingInputForType = z.infer<typeof ExpectingInputFor>

export const WorkflowSchema = WorkflowCore.extend({ id: WorkflowRef })
  .extend({ owner: WorkflowOwnerRef })
  .extend({
    lock: Lock.optional(),
    inProgress: z.boolean().optional(),
    isInitiated: z.boolean().optional(),
    expectingInputFor: ExpectingInputFor.optional(),
    externalInputStorage: ExternalInputStorage.optional(),
  })
  .openapi('Workflow')
export type WorkflowDef = z.infer<typeof WorkflowSchema>

export interface ClockOk {
  status: 'ok'
  node: NodeDefType
  exec: ExecutionResult
}

export interface ClockFinished {
  status: 'finished'
}

export interface ClockError {
  status: 'error'
  code: string
}

export interface ClockTerminated {
  status: 'terminated'
  node: NodeDefType
  exec: ExecutionResult
}

export interface ClockWaitingInput {
  status: 'waiting_for_input'
  node: NodeDefType
  expectingInputFor: ExpectingInputForType
}

export type ClockResult = ClockOk | ClockFinished | ClockError | ClockTerminated | ClockWaitingInput
