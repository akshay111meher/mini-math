import { WorkflowCoreType, WorkflowCore } from '@mini-math/workflow'
import { ListOptions, ListResult } from '@mini-math/utils'
import z from 'zod'

export const WorkflowImage = z.object({
  imageId: z.string(),
  workflowName: z.string().optional(),
  image: WorkflowCore,
})
export type WorkflowImageType = z.infer<typeof WorkflowImage>

export abstract class ImageStore {
  private initialized = false

  /** Called exactly once before any operation. */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  public async create(
    owner: string,
    imageId: string,
    core: WorkflowCoreType,
    workflowName?: string,
  ): Promise<boolean> {
    await this.ensureInitialized()
    return this._create(owner, imageId, core, workflowName)
  }

  public async get(owner: string, imageId: string): Promise<WorkflowCoreType | undefined> {
    await this.ensureInitialized()
    return this._get(owner, imageId)
  }

  public async update(
    owner: string,
    imageId: string,
    patch: Partial<WorkflowCoreType>,
    workflowName?: string,
  ): Promise<boolean> {
    await this.ensureInitialized()
    return this._update(owner, imageId, patch, workflowName)
  }

  public async exists(owner: string, imageId: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._exists(owner, imageId)
  }

  public async delete(owner: string, imageId: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._delete(owner, imageId)
  }

  public async list(options?: ListOptions): Promise<ListResult<WorkflowImageType>> {
    await this.ensureInitialized()
    return this._list(options)
  }

  public async count(owner: string): Promise<number> {
    await this.ensureInitialized()
    return this._count(owner)
  }

  protected abstract initialize(): Promise<void>

  protected abstract _create(
    owner: string,
    imageId: string,
    core: WorkflowCoreType,
    workflowName?: string,
  ): Promise<boolean>

  protected abstract _get(owner: string, imageId: string): Promise<WorkflowCoreType | undefined>

  protected abstract _update(
    owner: string,
    imageId: string,
    patch: Partial<WorkflowCoreType>,
    workflowName?: string,
  ): Promise<boolean>

  protected abstract _exists(owner: string, imageId: string): Promise<boolean>

  protected abstract _delete(owner: string, imageId: string): Promise<boolean>

  protected abstract _list(options?: ListOptions): Promise<ListResult<WorkflowImageType>>

  protected abstract _count(owner: string): number
}
