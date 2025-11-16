import { SecretDataType, SecretStore } from './secretStore.js'

/**
 * In-memory implementation of SecretStore.
 * Uses a Map keyed by `${userId}:${secretIdentifier}`.
 */
export class InMemorySecretStore extends SecretStore {
  private store = new Map<string, SecretDataType>()

  protected async initialize(): Promise<void> {
    return
  }

  private makeKey(userId: string, secretIdentifier: string): string {
    return `${userId}:${secretIdentifier}`
  }

  public async _saveSecret(record: SecretDataType): Promise<void> {
    const key = this.makeKey(record.userId, record.secretIdentifier)
    this.store.set(key, record)
  }

  public async _getSecret(
    userId: string,
    secretIdentifier: string,
  ): Promise<SecretDataType | null> {
    const key = this.makeKey(userId, secretIdentifier)
    return this.store.get(key) ?? null
  }

  public async _deleteSecret(userId: string, secretIdentifier: string): Promise<boolean> {
    const key = this.makeKey(userId, secretIdentifier)
    return this.store.delete(key)
  }

  public async _listSecrets(userId: string): Promise<SecretDataType[]> {
    const result: SecretDataType[] = []
    for (const record of this.store.values()) {
      if (record.userId === userId) {
        result.push(record)
      }
    }
    return result
  }
}
