import { KeyValueOptions, KeyValueStore } from './types.js'

export interface InMemoryOptions extends KeyValueOptions {
  cleanupEveryMs?: number // default 30s
}

type Entry = {
  value: string
  // epoch ms; undefined => persistent
  expiresAt?: number
}

export class InMemoryKeyValueStore extends KeyValueStore {
  private store = new Map<string, Entry>()
  private cleanupTimer?: ReturnType<typeof setInterval>
  private readonly cleanupEveryMs: number

  constructor(opts: InMemoryOptions = {}) {
    super(opts)
    this.cleanupEveryMs = opts.cleanupEveryMs ?? 30_000
    this.cleanupTimer =
      setInterval(() => this.gc(), this.cleanupEveryMs).unref?.() ??
      setInterval(() => this.gc(), this.cleanupEveryMs)
  }

  protected async initialize(): Promise<void> {
    return
  }

  protected async _get(key: string): Promise<string | null> {
    const e = this.store.get(key)
    if (!e) return null
    if (this.isExpired(e)) {
      this.store.delete(key)
      return null
    }
    return e.value
  }

  protected async _set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTTL
    const expiresAt = ttl && ttl > 0 ? Date.now() + ttl * 1000 : undefined
    this.store.set(key, { value, expiresAt })
  }

  protected async _del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0
  }

  protected async _exists(key: string): Promise<number> {
    const e = this.store.get(key)
    if (!e) return 0
    if (this.isExpired(e)) {
      this.store.delete(key)
      return 0
    }
    return 1
  }

  protected async _keys(pattern: string): Promise<string[]> {
    // Convert simple "*" wildcard to a regex.
    const asRegex = new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$')
    const keys: string[] = []
    for (const k of this.store.keys()) {
      const e = this.store.get(k)!
      if (this.isExpired(e)) {
        this.store.delete(k)
        continue
      }
      if (asRegex.test(k)) keys.push(k)
    }
    return keys
  }

  protected async _incrBy(key: string, amount: number): Promise<number> {
    const raw = await this._get(key)
    const current = raw == null ? 0 : Number(raw)
    const next = current + amount
    await this._set(key, String(next))
    return next
  }

  protected async _ttl(key: string): Promise<number | null> {
    const e = this.store.get(key)
    if (!e) return null
    if (this.isExpired(e)) {
      this.store.delete(key)
      return null
    }
    if (!e.expiresAt) return null
    const rem = Math.ceil((e.expiresAt - Date.now()) / 1000)
    return rem > 0 ? rem : null
  }

  protected async _expire(key: string, ttlSeconds: number): Promise<number> {
    const e = this.store.get(key)
    if (!e) return 0
    if (this.isExpired(e)) {
      this.store.delete(key)
      return 0
    }
    e.expiresAt = Date.now() + ttlSeconds * 1000
    this.store.set(key, e)
    return 1
  }

  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.store.clear()
  }

  private isExpired(e: Entry): boolean {
    return e.expiresAt !== undefined && e.expiresAt <= Date.now()
  }

  private gc(): void {
    const now = Date.now()
    for (const [k, e] of this.store.entries()) {
      if (e.expiresAt !== undefined && e.expiresAt <= now) {
        this.store.delete(k)
      }
    }
  }
}

// ---- util ----
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
