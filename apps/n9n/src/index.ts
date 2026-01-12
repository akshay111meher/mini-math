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
  .requiredOption('--allowed-origins <allowedOrigins>', 'Siwe Domain to bind')
  .requiredOption('--node-env <nodeEnv>', 'Production/Dev')
  .requiredOption('--node-env <etherscanApikey>', 'Etherscan APIKEY')
  .action(
    async (opts: {
      domain: string
      siwe: string
      allowedOrigins: string
      nodeEnv: string
      etherscanApikey: string
    }) => {
      const { domain, siwe, allowedOrigins, nodeEnv, etherscanApikey } = opts

      // TODO: your real logic here
      console.log(`Starting server on domain: ${domain}`)

      await App.start_server(
        domain,
        siwe,
        allowedOrigins
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
        etherscanApikey,
        nodeEnv.trim().toLowerCase() == 'production' || nodeEnv.trim().toLowerCase() == 'prod',
      )
    },
  )

// app start-worker --name worker-1
program
  .command('start-worker')
  .description('Start a background worker')
  .requiredOption('--name <name>', 'Worker name')
  .requiredOption('--webhook-secret <webhookSecret>', 'Webhook Secret')
  .requiredOption('--webhook-timeout-in-ms <webhookTimeoutInMs>', 'Webhook Timeout in ms')
  .action(async (opts: { name: string; webhookSecret: string; webhookTimeoutInMs: string }) => {
    const { name, webhookSecret, webhookTimeoutInMs } = opts

    // TODO: your real logic here
    console.log(`Starting worker with name: ${name}`)

    await App.start_worker(name, webhookSecret, parseInt(webhookTimeoutInMs))
  })

program
  .command('start-sepolia-payment-listener')
  .description('Start Sepolia Payment Listener')
  .requiredOption('--sepolia-rpc-url <SepoliaRpcUrl>', 'Sepolia RPC URL')
  .action(async (opts: { sepolia_rpc_url: string }) => {
    const { sepolia_rpc_url } = opts

    console.log(`Starting payment listener`)

    await App.start_sepolia_payment_listener(sepolia_rpc_url)
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
