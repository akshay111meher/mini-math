import {
  ERROR_CODES,
  NodeDefType,
  ExecutionResult,
  WorkflowGlobalState,
  ExecutionTimestamp,
  NodeDefClass,
  ExternalInputDataType,
  ExternalInputIdType,
  NodeRefType,
  InputType,
} from '@mini-math/nodes'
import { Logger, makeLogger } from '@mini-math/logger'
import { RuntimeDef } from '@mini-math/runtime'
import { NodeFactoryType } from '@mini-math/compiler'

import {
  ClockResult,
  ExpectingInputForType,
  WorkflowDef,
  ExternalInputStorageType,
} from './types.js'
import { bfsTraverse, hasCycle, deepClone } from './helper.js'
import { BaseSecretType } from '@mini-math/secrets'

export class Workflow implements WorkflowGlobalState {
  private readonly logger: Logger
  private nodeById: Map<string, NodeDefType> = new Map()
  private outgoing: Map<string, string[]> = new Map()
  private runtime: RuntimeDef
  private initialized = false
  private secrets: Map<string, string> = new Map()

  public static syntaxCheck(wf: WorkflowDef, nf: NodeFactoryType, rt?: RuntimeDef): Workflow {
    const workflow = new Workflow(wf, nf, [], rt)
    workflow.bfs()
    return workflow
  }

  constructor(
    private workflowDef: WorkflowDef,
    private nodeFactory: NodeFactoryType,
    secrets: Array<BaseSecretType>,
    runtimeDef?: RuntimeDef,
  ) {
    this.logger = makeLogger(`Workflow ID: ${this.workflowDef.id}`)
    this.logger.trace(`started to create workflow. ID: ${this.workflowDef.id}`)
    if (!runtimeDef) {
      this.runtime = {
        queue: [],
        visited: [],
        current: null,
        finished: false,
        id: this.workflowDef.id,
      }
    } else {
      this.runtime = runtimeDef
    }
    this._validateDefinition(this.workflowDef)
    this._buildIndexes()
    this._bootstrapRuntime()
    for (let index = 0; index < secrets.length; index++) {
      const secret = secrets[index]
      this.secrets.set(secret.secretIdentifier, secret.secretData)
    }
  }

  public hasExternalInput(): boolean {
    return this.workflowDef.nodes.some((n) => (n.externalInputs?.length ?? 0) > 0)
  }

  public readExternalInput(
    node: NodeRefType,
    externalInputId: ExternalInputIdType,
  ): ExternalInputDataType | undefined {
    return this.workflowDef.externalInputStorage?.[node]?.[externalInputId]
  }

  public getSecret(secretIdentifier: string): string | undefined {
    if (this.secrets.has(secretIdentifier)) {
      // need to decrypt here
      return this.secrets.get(secretIdentifier)
    }
    return undefined
  }

  public getGlobalState<T = unknown>(): T | undefined {
    return this.workflowDef.globalState === undefined
      ? undefined
      : (deepClone(this.workflowDef.globalState) as T)
  }

  public setGlobalState<T>(value: T): void {
    this.workflowDef.globalState = deepClone(value) as unknown
  }

  public updateGlobalState<T = unknown>(updater: (prev: Readonly<T | undefined>) => T): void {
    const prev = this.workflowDef.globalState as T | undefined
    const next = updater(deepClone(prev) as Readonly<T | undefined>)
    this.workflowDef.globalState = deepClone(next) as unknown
  }

  public updatePartialState<P extends Record<string, unknown>>(
    patch: Readonly<P>,
    opts?: { deep?: boolean },
  ): void {
    const prev = (this.workflowDef.globalState ?? {}) as Record<string, unknown> | unknown

    if (!Workflow.isPlainObject(prev)) {
      throw new Error('globalState is not an object; cannot apply partial update')
    }

    const next = opts?.deep ? Workflow.deepMerge(prev, patch) : { ...prev, ...patch }

    this.workflowDef.globalState = deepClone(next) as unknown
  }

  public id(): string {
    return this.workflowDef.id
  }

  private _validateDefinition(wf: WorkflowDef): void {
    this.logger.trace(`start valiadate for workflow. ID: ${this.workflowDef.id}`)
    if (!wf) throw new Error('Workflow definition is required')
    if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) {
      throw new Error('Workflow must have at least one node')
    }
    if (!wf.entry || typeof wf.entry !== 'string') {
      throw new Error('Workflow "entry" must be a non-empty string')
    }
    if (!Array.isArray(wf.edges)) {
      throw new Error('Workflow "edges" must be an array')
    }

    const ids = new Set<string>()
    const dups: string[] = []

    for (const n of wf.nodes) {
      if (!n || typeof n.id !== 'string' || n.id.trim() === '') {
        throw new Error('Every node must have a non-empty string "id"')
      }

      if (new NodeDefClass(n).hasUniqueExternalInputIds()) {
        // this is fine
      } else {
        throw new Error(`Node:${n.id}} doesn't have unique external inputs`)
      }
      if (ids.has(n.id)) dups.push(n.id)
      ids.add(n.id)
    }

    if (dups.length > 0) {
      const uniq = Array.from(new Set(dups))
      throw new Error(`Duplicate node id(s) found: ${uniq.join(', ')}`)
    }

    if (!ids.has(wf.entry)) {
      throw new Error(`Entry node "${wf.entry}" does not exist in nodes`)
    }

    // Validate edges reference existing nodes
    wf.edges.forEach((e, i) => {
      if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') {
        throw new Error(`Edge[${i}] must have "from" and "to" as strings`)
      }
      if (!ids.has(e.from)) {
        throw new Error(`Edge[${i}] "from"="${e.from}" does not match any node id`)
      }
      if (!ids.has(e.to)) {
        throw new Error(`Edge[${i}] "to"="${e.to}" does not match any node id`)
      }
      // If you want to forbid self-loops, uncomment:
      // if (e.from === e.to) {
      //   throw new Error(`Edge[${i}] forms a self-loop on node "${e.from}"`)
      // }
    })
  }

  private _buildIndexes(): void {
    this.logger.trace(`start building indexes for workflow. ID: ${this.workflowDef.id}`)
    this.nodeById = new Map(this.workflowDef.nodes.map((n) => [n.id, n]))

    this.outgoing = new Map<string, string[]>()
    for (const n of this.workflowDef.nodes) {
      this.outgoing.set(n.id, [])
    }
    for (const e of this.workflowDef.edges) {
      if (!this.outgoing.has(e.from)) this.outgoing.set(e.from, [])
      this.outgoing.get(e.from)!.push(e.to)
    }
  }

  private _bootstrapRuntime(): void {
    this.logger.trace(`start bootstraping runtime for workflow. ID: ${this.workflowDef.id}`)

    const rt = this.runtime
    if (rt.queue.length === 0 && rt.visited.length === 0 && !rt.finished) {
      rt.queue.push(this.workflowDef.entry)
    }
  }

  public bfs(): void {
    this._initialize()
    bfsTraverse(this.workflowDef)
  }

  private _initialize(): void {
    if (this.initialized) {
      this.logger.trace(
        `workflow. ID: ${this.workflowDef.id} is already initialized. Skipping initialization`,
      )
      return
    }

    this.logger.trace(`start initializing workflow. ID: ${this.workflowDef.id}`)
    if (hasCycle(this.workflowDef)) {
      throw new Error(ERROR_CODES.CYCLIC_WORKFLOW_DETECTED)
    }
    this.initialized = true
  }

  public async clock(): Promise<ClockResult> {
    this.logger.trace(`Clocking workflow. ID: ${this.workflowDef.id}`)
    this._initialize()

    const rt = this.runtime

    if (rt.finished) {
      return { status: 'error', code: ERROR_CODES.WORKFLOW_IS_ALREADY_EXECUTED }
    }

    this.workflowDef.inProgress = true
    if (rt.queue.length === 0) {
      this._finalizeIfPossible()
      return { status: 'finished' }
    }

    const { nodeId: currentNodeId, node: currentNode } = this._dequeueAndMark()

    const missingExternalInputId = this._getNextMissingExternalInputId(currentNode)

    if (missingExternalInputId) {
      this.logger.debug(
        `Workflow ID: ${this.workflowDef.id} node=${currentNodeId} is waiting for external input: ${missingExternalInputId}`,
      )

      const expectingInputFor = {
        node: currentNodeId,
        inputId: missingExternalInputId,
      }

      this.logger.trace(JSON.stringify(this.workflowDef.expectingInputFor))

      this.runtime.queue.unshift(currentNodeId)
      this.runtime.current = null

      return {
        status: 'waiting_for_input',
        node: currentNode,
        expectingInputFor,
      }
    }

    const execResult = await this._safeRunNode(currentNode)
    this.logger.trace(`execResult: ${JSON.stringify(execResult)}`)

    const terminated = this._applyExecResultToNode(currentNode, execResult)
    this.logger.trace(`workflow terminated: ${terminated}`)
    if (terminated) {
      return {
        status: 'terminated',
        node: currentNode,
        exec: execResult,
      }
    }

    this._scheduleChildren(currentNodeId, execResult)

    return {
      status: 'ok',
      node: currentNode,
      exec: execResult,
    }
  }

  private _dequeueAndMark(): { nodeId: string; node: NodeDefType } {
    this.logger.trace('_dequeueAndMark')
    const rt = this.runtime

    const currentNodeId = rt.queue.shift()!
    rt.current = currentNodeId

    if (!rt.visited.includes(currentNodeId)) {
      rt.visited.push(currentNodeId)
    }

    const currentNode = this.nodeById.get(currentNodeId)
    if (!currentNode) {
      throw new Error(`Node ${currentNodeId} not found in nodeById`)
    }

    return { nodeId: currentNodeId, node: currentNode }
  }

  private async _runNode(node: NodeDefType): Promise<ExecutionResult> {
    const executable = this.nodeFactory.make(node, this)
    const execResult = await executable.execute()
    return execResult
  }

  private _applyExecResultToNode(node: NodeDefType, execResult: ExecutionResult): boolean {
    if (execResult.status === 'ok' && execResult.payload) {
      const { outputs } = execResult.payload
      node.executed = true
      node.executionTimestamp = ExecutionTimestamp.parse(new Date().valueOf())
      node.outputs = outputs
    } else if (execResult.status === 'error') {
      node.executed = true
      node.executionTimestamp = ExecutionTimestamp.parse(new Date().valueOf())
      node.outputs = node.outputs ?? []
    }

    this.nodeById.set(node.id, node)

    if (execResult.terminateRun === true) {
      const rt = this.runtime
      rt.queue = []
      rt.current = null
      rt.finished = true
      return true
    }

    return false
  }

  private _scheduleChildren(parentNodeId: string, execResult: ExecutionResult): void {
    this.logger.trace('Scheduling children node execution')
    const rt = this.runtime

    const neighbors = this.outgoing.get(parentNodeId) ?? []
    let allowedNextIds: string[] = []

    if (execResult.status === 'error') {
      allowedNextIds = []
    } else if (execResult.next && execResult.next.length > 0) {
      const neighborSet = new Set(neighbors)
      allowedNextIds = execResult.next.filter((n) => neighborSet.has(n))
    } else {
      allowedNextIds = neighbors
    }

    for (const nextId of allowedNextIds) {
      const childNode = this.nodeById.get(nextId)
      if (!childNode) {
        throw new Error(`Child node ${nextId} not found in nodeById`)
      }

      const parentNode = this.nodeById.get(parentNodeId)
      if (!parentNode) {
        throw new Error(`Parent node ${parentNodeId} not found in nodeById`)
      }

      const updatedChild = this._wireOutputsToChild(parentNode, childNode)
      this.nodeById.set(updatedChild.id, updatedChild)

      const alreadyVisited = rt.visited.includes(nextId)
      const alreadyQueued = rt.queue.includes(nextId)

      if (!alreadyVisited && !alreadyQueued) {
        rt.queue.push(nextId)
      }
    }

    if (rt.queue.length === 0) {
      this._finalizeIfPossible()
    }
  }

  private _finalizeIfPossible(): void {
    const rt = this.runtime
    if (rt.queue.length === 0) {
      rt.current = null
      rt.finished = true
    }
  }

  private _wireOutputsToChild(parentNode: NodeDefType, childNode: NodeDefType): NodeDefType {
    if (!parentNode.executed) {
      return childNode
    }

    const parentOutputs = parentNode.outputs ?? []
    const existingInputs = childNode.inputs ?? []

    const mergedInputs = [...existingInputs]

    for (const out of parentOutputs) {
      mergedInputs.push(out)
    }

    childNode.inputs = mergedInputs
    return childNode
  }

  public getCurrentNode(): NodeDefType | null {
    const rt = this.runtime
    if (!rt.current) return null
    return this.nodeById.get(rt.current) ?? null
  }

  public getRuntimeState() {
    return { ...this.runtime }
  }

  public serialize(): [WorkflowDef, RuntimeDef] {
    const updatedNodes = this.workflowDef.nodes.map((origNode) => {
      const liveNode = this.nodeById.get(origNode.id) ?? origNode
      return deepClone(liveNode)
    })

    const wf: WorkflowDef = deepClone({
      ...this.workflowDef,
      nodes: updatedNodes,
    })

    const rt: RuntimeDef = deepClone(this.runtime)

    return [wf, rt]
  }

  private static isPlainObject(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null && Object.getPrototypeOf(x) === Object.prototype
  }

  private static deepMerge<T extends Record<string, unknown>, U extends Record<string, unknown>>(
    a: T,
    b: U,
  ): T & U {
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b) as Array<[string, unknown]>) {
      const av = out[k]
      if (this.isPlainObject(av) && this.isPlainObject(v)) {
        out[k] = this.deepMerge(av as Record<string, unknown>, v as Record<string, unknown>)
      } else {
        out[k] = deepClone(v)
      }
    }
    return out as T & U
  }

  private async _safeRunNode(node: NodeDefType): Promise<ExecutionResult> {
    try {
      return await this._runNode(node)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // TODO: Try to classify a common case: abstract method not implemented
      const code = /not implemented/i.test(msg)
        ? ERROR_CODES.NODE_METHOD_NOT_IMPLEMENTED
        : ERROR_CODES.NODE_EXECUTION_FAILED

      this.logger.error(`Node ${node.id} threw during execute(): ${msg}`)
      return {
        status: 'error',
        terminateRun: true,
        payload: {
          nodeId: node.id,
          outputs: [],
          errorCode: code,
          errorData: msg,
        },
      }
    }
  }

  private _getNextMissingExternalInputId(node: NodeDefType): ExternalInputIdType | undefined {
    const defs = node.externalInputs ?? []
    if (defs.length === 0) return undefined

    const storageForNode = this.workflowDef.externalInputStorage?.[node.id as NodeRefType] ?? {}

    // Go in order; skip already-present ones; stop at first missing
    for (const ext of defs) {
      const hasValue = storageForNode[ext.id] !== undefined

      if (!hasValue) {
        return ext.id
      }
    }

    // All inputs present → nothing missing
    return undefined
  }

  // status functions
  public inProgress(): boolean {
    return !!this.workflowDef.inProgress
  }

  public isInitiated(): boolean {
    return !!this.workflowDef.isInitiated
  }

  public expectingInputFor(): ExpectingInputForType | undefined {
    if (this.workflowDef.expectingInputFor) {
      return deepClone(this.workflowDef.expectingInputFor)
    }
    return undefined
  }

  public isFinished(): boolean {
    const rt = this.runtime
    this.logger.trace(`Workflow ID: ${this.workflowDef.id} rt.finished=${rt.finished}`)
    this.logger.trace(`Workflow ID: ${this.workflowDef.id} rt.queue.length=${rt.queue.length}`)
    return rt.finished === true || rt.queue.length === 0
  }

  public appendExternalInput(
    nodeId: NodeRefType,
    externalInputId: ExternalInputIdType,
    data: InputType,
  ): ExternalInputStorageType {
    // Start from existing storage or an empty one
    const currentStorage: ExternalInputStorageType = this.workflowDef.externalInputStorage ?? {}

    const nodeKey: string = nodeId
    const externalKey: string = externalInputId

    const currentNodeInputs = currentStorage[nodeKey] ?? {}

    const updatedNodeInputs: Record<string, ExternalInputDataType> = {
      ...currentNodeInputs,
      [externalKey]: {
        id: externalInputId,
        data,
      },
    }

    const updatedStorage: ExternalInputStorageType = {
      ...currentStorage,
      [nodeKey]: updatedNodeInputs,
    }

    // return a deep-cloned snapshot
    return deepClone(updatedStorage)
  }
}
