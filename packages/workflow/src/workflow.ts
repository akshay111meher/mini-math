import { ERROR_CODES, NodeDefType, NodeFactoryType, ExecutionResult } from '@mini-math/nodes'
import { ClockResult, WorkflowDef } from './types.js'
import { bfsTraverse, hasCycle } from './helper.js'

export class Workflow {
  private nodeById: Map<string, NodeDefType>
  private outgoing: Map<string, string[]>
  private initialized = false

  constructor(
    private workflowDef: WorkflowDef,
    private nodeFactory: NodeFactoryType,
  ) {
    this.nodeById = new Map(this.workflowDef.nodes.map((n) => [n.id, n]))

    this.outgoing = new Map<string, string[]>()
    for (const n of this.workflowDef.nodes) {
      this.outgoing.set(n.id, [])
    }
    for (const e of this.workflowDef.edges) {
      if (!this.outgoing.has(e.from)) {
        this.outgoing.set(e.from, [])
      }
      this.outgoing.get(e.from)!.push(e.to)
    }

    if (!this.workflowDef.runtime) {
      this.workflowDef.runtime = {
        queue: [],
        visited: [],
        current: null,
        finished: false,
      }
    }

    if (
      this.workflowDef.runtime.queue.length === 0 &&
      this.workflowDef.runtime.visited.length === 0 &&
      !this.workflowDef.runtime.finished
    ) {
      this.workflowDef.runtime.queue.push(this.workflowDef.entry)
    }
  }

  public bfs(): void {
    this._initialize()
    bfsTraverse(this.workflowDef)
  }

  private _initialize(): void {
    if (this.initialized) return
    if (hasCycle(this.workflowDef)) {
      throw new Error(ERROR_CODES.CYCLIC_WORKFLOW_DETECTED)
    }
    this.initialized = true
  }

  public async clock(): Promise<ClockResult> {
    this._initialize()

    const rt = this.workflowDef.runtime

    if (rt.finished) {
      return { status: 'error', code: ERROR_CODES.WORKFLOW_IS_ALREADY_EXECUTED }
    }

    if (rt.queue.length === 0) {
      this._finalizeIfPossible()
      return { status: 'finished' }
    }

    const { nodeId: currentNodeId, node: currentNode } = this._dequeueAndMark()

    const execResult = await this._runNode(currentNode)

    const terminated = this._applyExecResultToNode(currentNode, execResult)
    if (terminated) {
      return {
        status: 'ok',
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
    const rt = this.workflowDef.runtime

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
    const executable = this.nodeFactory.make(node)
    const execResult = await executable.execute()
    return execResult
  }

  private _applyExecResultToNode(node: NodeDefType, execResult: ExecutionResult): boolean {
    if (execResult.status === 'ok' && execResult.payload) {
      const { outputs } = execResult.payload
      node.executed = true
      node.outputs = outputs
    } else if (execResult.status === 'error') {
      node.executed = true
      node.outputs = node.outputs ?? []
    }

    this.nodeById.set(node.id, node)

    if (execResult.terminateRun === true) {
      const rt = this.workflowDef.runtime
      rt.queue = []
      rt.current = null
      rt.finished = true
      return true
    }

    return false
  }

  private _scheduleChildren(parentNodeId: string, execResult: ExecutionResult): void {
    const rt = this.workflowDef.runtime

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
    const rt = this.workflowDef.runtime
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
    const rt = this.workflowDef.runtime
    if (!rt.current) return null
    return this.nodeById.get(rt.current) ?? null
  }

  public getRuntimeState() {
    return { ...this.workflowDef.runtime }
  }

  public serialize(): WorkflowDef {
    const updatedNodes = this.workflowDef.nodes.map((origNode) => {
      const liveNode = this.nodeById.get(origNode.id)
      return liveNode ?? origNode
    })

    return {
      ...this.workflowDef,
      nodes: updatedNodes,
    }
  }

  public isFinished(): boolean {
    const rt = this.workflowDef.runtime
    return rt.finished === true || rt.queue.length === 0
  }
}
