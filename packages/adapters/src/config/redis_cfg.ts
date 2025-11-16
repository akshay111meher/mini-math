import { makeLogger } from '@mini-math/logger'
const logger = makeLogger('redisConfig')

export function getRedisUrl(): string {
  const host = process.env.REDIS_HOST ?? 'localhost'
  const port = process.env.REDIS_PORT ?? '6379'
  const user = process.env.REDIS_USER ?? 'default'
  logger.trace(`host: ${host}, port: ${port}, user: ${user}`)
  const password = process.env.REDIS_PASSWORD

  if (!password) {
    throw new Error('REDIS_PASSWORD is not set')
  }

  return `redis://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/0`
}
