import { ListOptions, ListResult } from '@mini-math/utils'
import { z } from 'zod'
export const UserRecordSchema = z.object({
  userId: z.string(),
  storageCredits: z.number(),
  executionCredits: z.number(),
  cdpAccountCredits: z.number(),
})
export type UserRecord = z.infer<typeof UserRecordSchema>

export const CreditDeltaSchema = z.object({
  storageCredits: z.number().optional(),
  executionCredits: z.number().optional(),
  cdpAccountCredits: z.number().optional(),
})
export type CreditDelta = z.infer<typeof CreditDeltaSchema>

export const GrantCreditDeltaSchema = CreditDeltaSchema.extend({ userId: z.string() })
export type GrantCreditDeltaSchemaType = z.infer<typeof GrantCreditDeltaSchema>

export abstract class UserStore {
  private initialized = false

  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  // PUBLIC API

  public async create(
    userId: string,
    storageCredits = 0,
    executionCredit = 0,
    cdpAccountCredits = 0,
  ): Promise<boolean> {
    await this.ensureInitialized()
    return this._create(userId, storageCredits, executionCredit, cdpAccountCredits)
  }

  public async get(userId: string): Promise<UserRecord | undefined> {
    await this.ensureInitialized()
    return this._get(userId)
  }

  public async upsert(
    userId: string,
    patch: Partial<Omit<UserRecord, 'userId'>>,
  ): Promise<UserRecord> {
    await this.ensureInitialized()
    return this._upsert(userId, patch)
  }

  public async adjustCredits(userId: string, delta: CreditDelta): Promise<UserRecord> {
    await this.ensureInitialized()
    return this._adjustCredits(userId, delta)
  }

  public async exists(userId: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._exists(userId)
  }

  public async delete(userId: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._delete(userId)
  }

  public async list(options?: ListOptions): Promise<ListResult<UserRecord>> {
    await this.ensureInitialized()
    return this._list(options)
  }

  // PROTECTED HOOKS

  protected abstract initialize(): Promise<void>

  protected abstract _create(
    userId: string,
    storageCredits: number,
    executionCredits: number,
    cdpAccountCredits: number,
  ): Promise<boolean>

  protected abstract _get(userId: string): Promise<UserRecord | undefined>

  protected abstract _upsert(
    userId: string,
    patch: Partial<Omit<UserRecord, 'userId'>>,
  ): Promise<UserRecord>

  protected abstract _adjustCredits(userId: string, delta: CreditDelta): Promise<UserRecord>

  protected abstract _exists(userId: string): Promise<boolean>

  protected abstract _delete(userId: string): Promise<boolean>

  protected abstract _list(options?: ListOptions): Promise<ListResult<UserRecord>>
}
