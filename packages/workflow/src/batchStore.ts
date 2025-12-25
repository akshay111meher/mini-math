import { allLimit, ListOptions, ListResult } from '@mini-math/utils'
import z from 'zod'
import { WorkflowStore } from './workflowStore.js'
import { WorkflowCoreType, WorkflowRefType } from './types.js'
import { v4 as uuidv4 } from 'uuid'
import { RuntimeStore } from '@mini-math/runtime'
/**
 * A "batch" groups multiple workflow ids under a single batchId.
 * batchId is owned (multi-tenant) via `owner`.
 */
export const WorkflowBatch = z.object({
  owner: z.string().min(1),
  batchId: z.string().min(1),
  workflowIds: z.array(z.string().min(1)),
})
export type WorkflowBatchType = z.infer<typeof WorkflowBatch>

export abstract class BatchStore {
  private initialized = false

  abstract workflowStore: WorkflowStore
  abstract runtimeStore: RuntimeStore

  /** Called exactly once before any operation. */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  /** Create a batch. Returns false if it already exists (implementation-defined). */
  public async create(
    owner: string,
    batchId: string,
    workflowCores: WorkflowCoreType[],
  ): Promise<WorkflowRefType[]> {
    await this.ensureInitialized()
    const createRequest = []

    for (let index = 0; index < workflowCores.length; index++) {
      const element = workflowCores[index]
      createRequest.push({
        workflowId: uuidv4(),
        core: element,
        owner,
      })
    }

    const workflowCreateResult = await this.workflowStore.createBatchOrNone(createRequest)
    const runtimeCreateResult = await this.runtimeStore.createBatchOrNone(
      workflowCreateResult.map((a) => {
        return {
          workflowId: a.id,
        }
      }),
    )
    const batchNoteResult = await this._create(
      owner,
      batchId,
      workflowCreateResult.map((a) => a.id),
    )

    if (batchNoteResult) {
      if (
        workflowCreateResult.length == workflowCores.length &&
        runtimeCreateResult.length == workflowCores.length
      ) {
        return workflowCreateResult.map((a) => a.id)
      }
    }

    return []
  }

  /** Get workflow ids for a batch. */
  public async get(owner: string, batchId: string): Promise<string[] | undefined> {
    await this.ensureInitialized()
    return this._get(owner, batchId)
  }

  /**
   * Replace the workflow ids for a batch.
   * (If you want patch semantics, use add/remove helpers below.)
   */
  public async set(owner: string, batchId: string, workflowIds: string[]): Promise<boolean> {
    await this.ensureInitialized()
    return this._set(owner, batchId, workflowIds)
  }

  /** True if the batch exists. */
  public async exists(owner: string, batchId: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._exists(owner, batchId)
  }

  /** Delete a batch. */
  public async delete(owner: string, batchId: string): Promise<boolean> {
    await this.ensureInitialized()
    const flows = await this._get(owner, batchId)
    if (flows) {
      const calls = []
      for (let index = 0; index < flows.length; index++) {
        const element = flows[index]
        calls.push(() => this.workflowStore.delete(element))
        calls.push(() => this.runtimeStore.delete(element))
      }

      await allLimit(calls, 5)
    }
    return this._delete(owner, batchId)
  }

  /** List batches (implementation can support filtering/sorting via ListOptions). */
  public async list(owner: string, options?: ListOptions): Promise<ListResult<WorkflowBatchType>> {
    await this.ensureInitialized()
    return this._list(owner, options)
  }

  /** Count batches for an owner. */
  public async count(owner: string): Promise<number> {
    await this.ensureInitialized()
    return this._count(owner)
  }

  protected abstract initialize(): Promise<void>

  protected abstract _create(
    owner: string,
    batchId: string,
    workflowRefs: WorkflowRefType[],
  ): Promise<boolean>

  protected abstract _get(owner: string, batchId: string): Promise<string[] | undefined>

  protected abstract _set(owner: string, batchId: string, workflowIds: string[]): Promise<boolean>

  protected abstract _exists(owner: string, batchId: string): Promise<boolean>

  protected abstract _delete(owner: string, batchId: string): Promise<boolean>

  protected abstract _list(
    owner: string,
    options?: ListOptions,
  ): Promise<ListResult<WorkflowBatchType>>

  protected abstract _count(owner: string): Promise<number>
}
