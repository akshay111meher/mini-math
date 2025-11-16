import { SecretDataType, SecretStore } from './secretStore.js'

/**
 * In-memory implementation of SecretStore.
 * Uses a Map keyed by `${userId}:${secretIdentifier}`.
 */
export class InMemorySecretStore extends SecretStore {
  private store = new Map<string, SecretDataType>()

  protected async onInit(): Promise<void> {
    // Nothing special to do for in-memory, but keeps the contract.
    // Could prewarm, load from file, etc.
    return
  }

  private makeKey(userId: string, secretIdentifier: string): string {
    return `${userId}:${secretIdentifier}`
  }

  public async saveSecret(record: SecretDataType): Promise<void> {
    this.ensureInitialized()
    const key = this.makeKey(record.userId, record.secretIdentifier)
    this.store.set(key, record)
  }

  public async getSecret(userId: string, secretIdentifier: string): Promise<SecretDataType | null> {
    this.ensureInitialized()
    const key = this.makeKey(userId, secretIdentifier)
    return this.store.get(key) ?? null
  }

  public async deleteSecret(userId: string, secretIdentifier: string): Promise<boolean> {
    this.ensureInitialized()
    const key = this.makeKey(userId, secretIdentifier)
    return this.store.delete(key)
  }

  public async listSecrets(userId: string): Promise<SecretDataType[]> {
    this.ensureInitialized()
    const result: SecretDataType[] = []
    for (const record of this.store.values()) {
      if (record.userId === userId) {
        result.push(record)
      }
    }
    return result
  }
}
