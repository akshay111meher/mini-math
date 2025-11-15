export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export interface KeyValueOptions {
  namespace?: string // optional key prefix
  defaultTTL?: number // seconds; applies when per-call ttl not provided
}

/**
 * Abstract, typed KV store.
 * Implementations should store values as JSON strings and honor TTL when provided.
 */
export abstract class KeyValueStore {
  protected readonly namespace: string
  protected readonly defaultTTL?: number

  // --- lifecycle ---
  private initialized = false
  private initPromise: Promise<void> | null = null

  constructor(opts: KeyValueOptions = {}) {
    this.namespace = (opts.namespace ?? '').trim()
    this.defaultTTL = opts.defaultTTL
  }

  async init(): Promise<void> {
    if (this.initialized) return

    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.initialize()
        this.initialized = true
      })()
    }

    return this.initPromise
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }

  // ---- Public API (stable surface) ----
  async get<T extends JsonValue = JsonValue>(key: string): Promise<T | null> {
    await this.ensureInitialized()
    const raw = await this._get(this.n(key))
    return raw == null ? null : this.deserialize<T>(raw)
  }

  async set<T extends JsonValue = JsonValue>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    await this.ensureInitialized()
    const ttl = ttlSeconds ?? this.defaultTTL
    const raw = this.serialize(value)
    await this._set(this.n(key), raw, ttl)
  }

  async del(key: string): Promise<boolean> {
    await this.ensureInitialized()
    return (await this._del(this.n(key))) > 0
  }

  async exists(key: string): Promise<boolean> {
    return (await this._exists(this.n(key))) > 0
  }

  /**
   * keys("*") returns all keys in this namespace.
   * Supports simple `*` wildcard (converted to regex).
   */
  async keys(pattern = '*'): Promise<string[]> {
    await this.ensureInitialized()
    const namespacedPattern = this.n(pattern)
    const full = await this._keys(namespacedPattern)
    // Strip namespace prefix for returned keys
    const prefix = this.nsPrefix()
    return full.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
  }

  async incrBy(key: string, amount = 1): Promise<number> {
    await this.ensureInitialized()
    return this._incrBy(this.n(key), amount)
  }

  /**
   * TTL in seconds. Return:
   *  - > 0: seconds to expire
   *  - 0 or null: no TTL / persistent
   *  - -2: key does not exist (normalized to null)
   */
  async ttl(key: string): Promise<number | null> {
    await this.ensureInitialized()
    const t = await this._ttl(this.n(key))
    if (t == null || t < 0) return null
    return t
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureInitialized()
    return (await this._expire(this.n(key), ttlSeconds)) > 0
  }

  protected async close(): Promise<void> {
    // Optional; overridden by implementations that need teardown.
  }

  // ---- Methods for subclasses to implement ----
  protected abstract initialize(): Promise<void>
  protected abstract _get(key: string): Promise<string | null>
  protected abstract _set(key: string, value: string, ttlSeconds?: number): Promise<void>
  protected abstract _del(key: string): Promise<number>
  protected abstract _exists(key: string): Promise<number>
  protected abstract _keys(pattern: string): Promise<string[]>
  protected abstract _incrBy(key: string, amount: number): Promise<number>
  protected abstract _ttl(key: string): Promise<number | null>
  protected abstract _expire(key: string, ttlSeconds: number): Promise<number>

  // ---- Helpers ----
  protected nsPrefix(): string {
    return this.namespace ? `${this.namespace}:` : ''
  }

  protected n(key: string): string {
    return `${this.nsPrefix()}${key}`
  }

  protected serialize<T extends JsonValue>(value: T): string {
    return JSON.stringify(value)
  }
  protected deserialize<T extends JsonValue>(raw: string): T {
    return JSON.parse(raw) as T
  }
}
