import { ListOptions, ListResult } from '@mini-math/utils'
import z from 'zod'

export const CdpAccountNameSchema = z.object({ userId: z.string(), accountName: z.string() })
export type CdpAccountName = z.infer<typeof CdpAccountNameSchema>

export abstract class CdpAccountStore {
  protected initialized = false

  private async init(): Promise<void> {
    if (this.initialized) return
    await this.onInit()
    this.initialized = true
  }
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }

  public async exists(userId: string, accountName: string): Promise<boolean> {
    await this.ensureInitialized()
    try {
      await this._existCdpAccountName(userId, accountName)
      return true
    } catch {
      return false
    }
  }

  public async store(userId: string, accountName: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._storeCdpAccountName(userId, accountName)
  }

  public async listByUser(userId: string, opts?: ListOptions): Promise<ListResult<CdpAccountName>> {
    await this.ensureInitialized()
    return this._listCdpAccountNamesByUser(userId, opts)
  }

  protected abstract onInit(): Promise<void>
  protected abstract _existCdpAccountName(userId: string, accountName: string): Promise<boolean>
  protected abstract _storeCdpAccountName(userId: string, accountName: string): Promise<boolean>
  protected abstract _listCdpAccountNamesByUser(
    userId: string,
    opts?: ListOptions,
  ): Promise<ListResult<CdpAccountName>>
}
