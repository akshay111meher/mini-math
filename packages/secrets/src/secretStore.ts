import z from 'zod'

export const SecretIdenfiferSchema = z.object({ secretIdentifier: z.string() })
export type SecretIdenfiferType = z.infer<typeof SecretIdenfiferSchema>

export const BaseSecretSchema = SecretIdenfiferSchema.extend({ secretData: z.string() })
export type BaseSecretType = z.infer<typeof BaseSecretSchema>

export const SecretDataSchema = BaseSecretSchema.extend({ userId: z.string() })
export type SecretDataType = z.infer<typeof SecretDataSchema>

/**
 * Base abstract secret store:
 * - has init lifecycle via onInit() + ensureInitialized()
 * - public methods call internal underscored impls
 */
export abstract class SecretStore {
  private initialized = false

  /** Guard to make sure onInit() has been called exactly once. */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
      this.initialized = true
    }
  }

  // ---- Public API: these call into underscored impls ----

  public async saveSecret(record: SecretDataType): Promise<void> {
    await this.ensureInitialized()
    return this._saveSecret(record)
  }

  public async getSecret(userId: string, secretIdentifier: string): Promise<SecretDataType | null> {
    await this.ensureInitialized()
    return this._getSecret(userId, secretIdentifier)
  }

  public async deleteSecret(userId: string, secretIdentifier: string): Promise<boolean> {
    await this.ensureInitialized()
    return this._deleteSecret(userId, secretIdentifier)
  }

  public async listSecrets(userId: string): Promise<SecretDataType[]> {
    await this.ensureInitialized()
    return this._listSecrets(userId)
  }

  // ---- Internal impls for subclasses ----

  /** Subclass-specific initialization (e.g. DB connections). */
  protected abstract initialize(): Promise<void>

  protected abstract _saveSecret(record: SecretDataType): Promise<void>

  protected abstract _getSecret(
    userId: string,
    secretIdentifier: string,
  ): Promise<SecretDataType | null>

  protected abstract _deleteSecret(userId: string, secretIdentifier: string): Promise<boolean>

  protected abstract _listSecrets(userId: string): Promise<SecretDataType[]>
}
