import { ListOptions, ListResult } from '@mini-math/utils'
import { WorkflowCoreType } from './types.js'
import { WorkflowStore } from './workflowStore.js'
import { BatchStore, WorkflowBatchType } from './batchStore.js' // adjust path
import { RuntimeStore } from '@mini-math/runtime'

type BatchKey = string // `${owner}:${batchId}`
const keyOf = (owner: string, batchId: string): BatchKey => `${owner}:${batchId}`

function applyListOptions<T>(items: T[], options?: ListOptions): ListResult<T> {
  const anyOpts = (options ?? {}) as any
  const skip = typeof anyOpts.skip === 'number' ? anyOpts.skip : 0
  const limit = typeof anyOpts.limit === 'number' ? anyOpts.limit : items.length

  const total = items.length
  const page = items.slice(skip, skip + limit)

  return {
    items: page,
    total,
    ...(typeof anyOpts.skip === 'number' ? { skip } : {}),
    ...(typeof anyOpts.limit === 'number' ? { limit } : {}),
  } as any
}

export class InMemoryBatchStore extends BatchStore {
  public workflowStore: WorkflowStore
  public runtimeStore: RuntimeStore

  // (owner,batchId) -> "workflowIds" (we will store indices as strings: "0","1","2"...)
  private batches = new Map<BatchKey, string[]>()

  constructor(workflowStore: WorkflowStore, runtimeStore: RuntimeStore) {
    super()
    this.workflowStore = workflowStore
    this.runtimeStore = runtimeStore
  }

  protected async initialize(): Promise<void> {
    // no-op
  }

  protected async _create(
    owner: string,
    batchId: string,
    workflowCores: WorkflowCoreType[],
  ): Promise<boolean> {
    const k = keyOf(owner, batchId)
    if (this.batches.has(k)) return false

    // Store indices as the "workflowIds" in this in-memory batch DS.
    // Example: workflowCores.length === 3 => ["0","1","2"]
    const workflowIds = Array.from({ length: workflowCores.length }, (_, i) => String(i))

    this.batches.set(k, workflowIds)
    return true
  }

  protected async _get(owner: string, batchId: string): Promise<string[] | undefined> {
    const ids = this.batches.get(keyOf(owner, batchId))
    return ids ? [...ids] : undefined
  }

  protected async _set(owner: string, batchId: string, workflowIds: string[]): Promise<boolean> {
    const k = keyOf(owner, batchId)
    if (!this.batches.has(k)) return false
    this.batches.set(k, [...workflowIds])
    return true
  }

  protected async _exists(owner: string, batchId: string): Promise<boolean> {
    return this.batches.has(keyOf(owner, batchId))
  }

  protected async _delete(owner: string, batchId: string): Promise<boolean> {
    return this.batches.delete(keyOf(owner, batchId))
  }

  protected async _list(
    owner: string,
    options?: ListOptions,
  ): Promise<ListResult<WorkflowBatchType>> {
    const items: WorkflowBatchType[] = []

    for (const [k, workflowIds] of this.batches.entries()) {
      const sep = k.indexOf(':')
      const kOwner = sep === -1 ? k : k.slice(0, sep)
      if (kOwner !== owner) continue

      const batchId = sep === -1 ? '' : k.slice(sep + 1)
      items.push({ owner: kOwner, batchId, workflowIds: [...workflowIds] })
    }

    items.sort((a, b) => a.batchId.localeCompare(b.batchId))

    return applyListOptions(items, options)
  }

  protected async _count(owner: string): Promise<number> {
    let n = 0
    const prefix = `${owner}:`
    for (const k of this.batches.keys()) {
      if (k.startsWith(prefix)) n++
    }
    return n
  }
}
