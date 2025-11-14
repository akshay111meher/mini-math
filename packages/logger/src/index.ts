import pino from 'pino'
import { config } from 'dotenv'
config()

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
export interface Logger {
  child(bindings?: Record<string, unknown>): Logger
  fatal(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  debug(msg: string, meta?: Record<string, unknown>): void
  trace(msg: string, meta?: Record<string, unknown>): void
}

const isProd = process.env.NODE_ENV === 'production'

const root = pino({
  level: process.env.LOG_LEVEL ?? 'trace',
  base: null,
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
      },
})

function wrap(instance: pino.Logger): Logger {
  type PinoCall = (meta: Record<string, unknown>, msg: string) => void

  const fns: Record<Level, PinoCall> = {
    fatal: (meta, msg) => instance.fatal(meta, msg),
    error: (meta, msg) => instance.error(meta, msg),
    warn: (meta, msg) => instance.warn(meta, msg),
    info: (meta, msg) => instance.info(meta, msg),
    debug: (meta, msg) => instance.debug(meta, msg),
    trace: (meta, msg) => instance.trace(meta, msg),
  }

  const call = (lvl: Level, msg: string, meta?: Record<string, unknown>) => {
    fns[lvl](meta ?? {}, msg)
  }

  return {
    child: (bindings) => wrap(instance.child(bindings ?? {})),
    fatal: (m, meta) => call('fatal', m, meta),
    error: (m, meta) => call('error', m, meta),
    warn: (m, meta) => call('warn', m, meta),
    info: (m, meta) => call('info', m, meta),
    debug: (m, meta) => call('debug', m, meta),
    trace: (m, meta) => call('trace', m, meta),
  }
}

export const logger: Logger = wrap(root)

export function makeLogger(service: string): Logger {
  return logger.child({ service })
}
