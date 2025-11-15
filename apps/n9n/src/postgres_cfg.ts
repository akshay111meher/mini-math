export function getPostgresUrl(): string {
  const host = process.env.POSTGRES_HOST ?? 'localhost'
  const port = process.env.POSTGRES_PORT ?? '5432'
  const user = process.env.POSTGRES_USER ?? 'postgres'
  const password = process.env.POSTGRES_PASSWORD
  const db = process.env.POSTGRES_DB ?? 'postgres'

  if (!password) {
    throw new Error('POSTGRES_PASSWORD is not set')
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${encodeURIComponent(db)}`
}
