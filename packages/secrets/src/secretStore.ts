import z from 'zod'

export const SecretIdenfiferSchema = z.object({ secretIdentifier: z.string() })
export type SecretIdenfiferType = z.infer<typeof SecretIdenfiferSchema>

export const BaseSecretSchema = SecretIdenfiferSchema.extend({ secretData: z.string() })
export type BaseSecretType = z.infer<typeof BaseSecretSchema>

export const SecretDataSchema = BaseSecretSchema.extend({ userId: z.string() })
export type SecretDataType = z.infer<typeof SecretDataSchema>

/**
 * Base abstract secret store:
 * - has init() lifecycle
 * - tracks initialized state
 * - exposes abstract CRUD methods
 */
export abstract class SecretStore {
  private initialized = false

  /** Subclass-specific initialization (e.g. DB connections). */
  protected abstract onInit(): Promise<void>

  /** Call this once before using the store. Safe to call multiple times. */
  public async init(): Promise<void> {
    if (this.initialized) return
    await this.onInit()
    this.initialized = true
  }

  /** Guard to make sure init() has been called. */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SecretStore not initialized. Call init() before use.')
    }
  }

  // ---- Abstract operations ----
  public abstract saveSecret(record: SecretDataType): Promise<void>

  public abstract getSecret(
    userId: string,
    secretIdentifier: string,
  ): Promise<SecretDataType | null>

  public abstract deleteSecret(userId: string, secretIdentifier: string): Promise<boolean>

  public abstract listSecrets(userId: string): Promise<SecretDataType[]>
}
