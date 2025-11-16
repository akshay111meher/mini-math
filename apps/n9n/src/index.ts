import { App } from './types.js'

import { Command } from 'commander'

const program = new Command()

const VALID_COMMANDS = new Set(['start-server', 'start-worker'])

program.name('app').description('Tiny CLI to manage server and worker').version('0.1.0')

// app start-server --domain foo.com
program
  .command('start-server')
  .description('Start the HTTP server')
  .requiredOption('--domain <domain>', 'Domain to bind')
  .requiredOption('--siwe <siwe>', 'Siwe Domain to bind')
  .action(async (opts: { domain: string, siwe: string }) => {
    const { domain, siwe } = opts

    // TODO: your real logic here
    console.log(`Starting server on domain: ${domain}`)

    await App.start_server(domain, siwe)
  })

// app start-worker --name worker-1
program
  .command('start-worker')
  .description('Start a background worker')
  .requiredOption('--name <name>', 'Worker name')
  .action(async (opts: { name: string }) => {
    const { name } = opts

    // TODO: your real logic here
    console.log(`Starting worker with name: ${name}`)

    await App.start_worker(name)
  })

const maybeCommand = process.argv[2]

// Only treat it as a command if it's not an option (doesn't start with "-")
if (maybeCommand && !maybeCommand.startsWith('-') && !VALID_COMMANDS.has(maybeCommand)) {
  console.error(
    `Unknown command: "${maybeCommand}".` +
      `\nValid commands are: ${Array.from(VALID_COMMANDS).join(', ')}.`,
  )

  process.exit(1)
}

program.parse(process.argv)
