import { ListOptions, ListResult } from '@mini-math/utils'
import { SecretDataType, SecretStore } from './secretStore.js'
import { CdpAccountName, CdpAccountStore } from './cdpAccountStore.js'

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

export class InMemoryCdpStore extends CdpAccountStore {
  // primary key: (userId, accountName)
  private byPk = new Map<string, CdpAccountName>()
  // secondary index: userId -> set(accountName)
  private byUser = new Map<string, Set<string>>()

  protected async onInit(): Promise<void> {
    // nothing to do for in-memory
  }

  protected async _existCdpAccountName(userId: string, accountName: string): Promise<boolean> {
    this.assertNonEmpty(userId, 'userId')
    this.assertNonEmpty(accountName, 'accountName')

    const key = this.pk(userId, accountName)
    return this.byPk.has(key)
  }

  protected async _storeCdpAccountName(userId: string, accountName: string): Promise<boolean> {
    this.assertNonEmpty(userId, 'userId')
    this.assertNonEmpty(accountName, 'accountName')

    const key = this.pk(userId, accountName)
    if (this.byPk.has(key)) return false

    const row: CdpAccountName = { userId, accountName }
    this.byPk.set(key, row)

    const set = this.byUser.get(userId) ?? new Set<string>()
    set.add(accountName)
    this.byUser.set(userId, set)

    return true
  }

  protected async _listCdpAccountNamesByUser(
    userId: string,
    opts: ListOptions = {},
  ): Promise<ListResult<CdpAccountName>> {
    this.assertNonEmpty(userId, 'userId')

    const limit = opts.limit ?? 50
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error('VALIDATION: limit must be > 0')
    }

    const set = this.byUser.get(userId)
    if (!set || set.size === 0) return { items: [] }

    // stable order for cursor pagination
    const names = Array.from(set).sort((a, b) => a.localeCompare(b))

    // cursor is "accountName" (base64url). Items returned strictly after cursor.
    let start = 0
    if (opts.cursor) {
      const after = this.decodeCursor(opts.cursor)
      // find first element strictly greater than "after"
      const idx = names.findIndex((n) => n > after)
      start = idx === -1 ? names.length : idx
    }

    const slice = names.slice(start, start + limit)
    const items = slice.map((accountName) => ({ userId, accountName }))

    const nextCursor =
      start + limit < names.length ? this.encodeCursor(slice[slice.length - 1]!) : undefined

    return { items, nextCursor }
  }
  private pk(userId: string, accountName: string): string {
    return `${userId}\u0000${accountName}`
  }

  private assertNonEmpty(v: string, name: string) {
    if (typeof v !== 'string' || v.trim().length === 0) {
      throw new Error(`VALIDATION: ${name} must be a non-empty string`)
    }
  }

  private encodeCursor(accountName: string): string {
    return Buffer.from(accountName, 'utf8').toString('base64url')
  }

  private decodeCursor(cursor: string): string {
    try {
      return Buffer.from(cursor, 'base64url').toString('utf8')
    } catch {
      throw new Error('VALIDATION: invalid cursor')
    }
  }
}
