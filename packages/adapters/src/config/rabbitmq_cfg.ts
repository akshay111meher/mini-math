import { makeLogger } from '@mini-math/logger'
const logger = makeLogger('rabbitMqConfig')

export function getRabbitMqUrl(): string {
  const host = process.env.RABBITMQ_HOST ?? 'localhost'
  logger.trace(`host: ${host}`)
  const port = process.env.RABBITMQ_PORT ?? '5672'
  logger.trace(`port: ${port}`)
  const user = process.env.RABBITMQ_USER ?? process.env.RABBITMQ_DEFAULT_USER ?? 'guest'
  logger.trace(`user: ${user}`)
  const password = process.env.RABBITMQ_PASSWORD ?? process.env.RABBITMQ_DEFAULT_PASS

  if (!password) {
    throw new Error('RABBITMQ_PASSWORD or RABBITMQ_DEFAULT_PASS is not set')
  }

  const rawVhost = process.env.RABBITMQ_VHOST ?? '/'
  const vhost = encodeURIComponent(rawVhost)

  return `amqp://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${vhost}`
}
