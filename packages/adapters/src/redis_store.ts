// redis-store.ts
import { createClient, SetOptions } from 'redis'
import { KeyValueStore } from '@mini-math/keystore'
import { Logger, makeLogger } from '@mini-math/logger'

type RedisClient = ReturnType<typeof createClient>
/**
 * Concrete Redis-backed store using node-redis v4/5.
 */
export class RedisStore extends KeyValueStore {
  private readonly client: RedisClient
  private logger: Logger
  constructor(url: string) {
    super()
    this.logger = makeLogger('Redis Store')
    this.client = createClient({ url })

    this.client.on('error', (err) => {
      this.logger.error('[redis] client error:', err)
    })
  }

  protected async initialize(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect()
    }
  }

  protected async _get(key: string): Promise<string | null> {
    return await this.client.get(key)
  }
  protected async _set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const options: SetOptions = {}
    if (ttlSeconds && ttlSeconds > 0) {
      options.EX = ttlSeconds
    }
    // The `set` method returns a string reply ("OK") or null.
    await this.client.set(key, value, options)
  }
  protected async _del(key: string): Promise<number> {
    return await this.client.del(key)
  }
  protected async _exists(key: string): Promise<number> {
    return await this.client.exists(key)
  }
  protected async _keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern)
  }
  protected async _incrBy(key: string, amount: number): Promise<number> {
    return await this.client.incrBy(key, amount)
  }
  protected async _ttl(key: string): Promise<number | null> {
    const t = await this.client.ttl(key)
    // Note: node-redis returns -2 if key does not exist, -1 if key exists but has no expire
    return t >= 0 ? t : null
  }
  protected async _expire(key: string, ttlSeconds: number): Promise<number> {
    return await this.client.expire(key, ttlSeconds)
  }
  protected async close(): Promise<void> {
    await this.client.quit()
  }
}
