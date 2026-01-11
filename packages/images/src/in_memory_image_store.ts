import { WorkflowCoreType } from '@mini-math/workflow'
import { ListOptions, ListResult } from '@mini-math/utils'
import { ImageStore, WorkflowImageType } from './image.js'

export class InMemoryImageStore extends ImageStore {
  // owner -> imageId -> { core, workflowName? }
  private store: Map<string, Map<string, { core: WorkflowCoreType; workflowName?: string }>>

  constructor() {
    super()
    this.store = new Map()
  }

  protected async initialize(): Promise<void> {
    return
  }

  protected async _create(
    owner: string,
    imageId: string,
    core: WorkflowCoreType,
    workflowName?: string,
  ): Promise<boolean> {
    let ownerMap = this.store.get(owner)
    if (!ownerMap) {
      ownerMap = new Map()
      this.store.set(owner, ownerMap)
    }

    // return false if already exists
    if (ownerMap.has(imageId)) {
      return false
    }

    ownerMap.set(imageId, { core, workflowName })
    return true
  }

  protected async _get(owner: string, imageId: string): Promise<WorkflowCoreType | undefined> {
    const ownerMap = this.store.get(owner)
    if (!ownerMap) return undefined
    return ownerMap.get(imageId)?.core
  }

  protected async _update(
    owner: string,
    imageId: string,
    patch: Partial<WorkflowCoreType>,
    workflowName?: string,
  ): Promise<boolean> {
    const ownerMap = this.store.get(owner)
    if (!ownerMap) return false

    const existing = ownerMap.get(imageId)
    if (!existing) return false

    // shallow merge is fine because WorkflowCoreType is a plain object
    const updated: WorkflowCoreType = { ...existing.core, ...patch }

    // only overwrite workflowName if caller explicitly provided it
    const nextWorkflowName = workflowName === undefined ? existing.workflowName : workflowName

    ownerMap.set(imageId, { core: updated, workflowName: nextWorkflowName })
    return true
  }

  protected async _exists(owner: string, imageId: string): Promise<boolean> {
    const ownerMap = this.store.get(owner)
    return ownerMap?.has(imageId) ?? false
  }

  protected async _delete(owner: string, imageId: string): Promise<boolean> {
    const ownerMap = this.store.get(owner)
    if (!ownerMap) return false

    const deleted = ownerMap.delete(imageId)

    // clean up empty owner maps
    if (ownerMap.size === 0) {
      this.store.delete(owner)
    }

    return deleted
  }

  protected async _list(options?: ListOptions): Promise<ListResult<WorkflowImageType>> {
    const all: WorkflowImageType[] = []

    // flatten all owners into a single list of { imageId, workflowName?, image }
    for (const [, images] of this.store) {
      for (const [imageId, { core, workflowName }] of images) {
        all.push({ imageId, workflowName, image: core })
      }
    }

    const startIndex = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0
    const limit = options?.limit ?? all.length

    const items = all.slice(startIndex, startIndex + limit)
    const nextIndex = startIndex + limit
    const nextCursor = nextIndex < all.length ? String(nextIndex) : undefined

    return { items, nextCursor }
  }

  protected _count(owner: string): number {
    const ownerMap = this.store.get(owner)
    return ownerMap ? ownerMap.size : 0
  }
}
