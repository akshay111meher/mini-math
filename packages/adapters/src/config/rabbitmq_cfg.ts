// config/rabbitmq.ts
export function getRabbitMqUrl(): string {
  const host = process.env.RABBITMQ_HOST ?? 'localhost'
  const port = process.env.RABBITMQ_PORT ?? '5672'
  const user = process.env.RABBITMQ_USER ?? process.env.RABBITMQ_DEFAULT_USER ?? 'guest'
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
