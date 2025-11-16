import { makeLogger } from '@mini-math/logger'
const logger = makeLogger('postgresConfig')

export function getPostgresUrl(): string {
  const host = process.env.POSTGRES_HOST ?? 'localhost'
  logger.trace(`host: ${host}`)
  const port = process.env.POSTGRES_PORT ?? '5432'
  logger.trace(`post: ${port}`)
  const user = process.env.POSTGRES_USER ?? 'postgres'
  logger.trace(`user: ${host}`)
  const password = process.env.POSTGRES_PASSWORD

  const db = process.env.POSTGRES_DB ?? 'postgres'
  logger.trace(`db: ${db}`)

  if (!password) {
    throw new Error('POSTGRES_PASSWORD is not set')
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${encodeURIComponent(db)}`
}
