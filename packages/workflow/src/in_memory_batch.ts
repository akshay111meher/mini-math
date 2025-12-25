import { ListOptions, ListResult } from '@mini-math/utils'
import { WorkflowRefType } from './types.js'
import { WorkflowStore } from './workflowStore.js'
import { BatchStore, WorkflowBatchType } from './batchStore.js' // adjust path
import { RuntimeStore } from '@mini-math/runtime'

type BatchKey = string // `${owner}:${batchId}`
const keyOf = (owner: string, batchId: string): BatchKey => `${owner}:${batchId}`

function applyListOptions<T>(items: T[], options?: ListOptions): ListResult<T> {
  const limit = options?.limit ?? items.length

  const page = items.slice(0, limit)

  // Cursor semantics: if the caller didn’t ask for cursor paging, don’t emit one.
  // If they did, emit a nextCursor only when there are more items.
  const wantsCursorPaging = options?.cursor !== undefined || options?.limit !== undefined
  const hasMore = items.length > limit

  const result: ListResult<T> = { items: page }

  if (wantsCursorPaging && hasMore) {
    // simplest opaque cursor: offset as string (you can swap to base64, etc.)
    result.nextCursor = String(limit)
  }

  return result
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
    workflowRefs: WorkflowRefType[],
  ): Promise<boolean> {
    const k = keyOf(owner, batchId)
    if (this.batches.has(k)) return false

    this.batches.set(k, workflowRefs)
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
