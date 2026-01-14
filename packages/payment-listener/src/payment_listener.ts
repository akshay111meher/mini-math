import { PostgresUserStore, PostgresKeyValueStore, RabbitMQQueue } from '@mini-math/adapters'
import { makeLogger, Logger } from '@mini-math/logger'
import { ethers } from 'ethers'
import { UserRecord } from '@mini-math/rbac'

const WAIT_TIME = 12000
const CHUNK_SIZE = 200

// how many blocks to fetch in one go
const BLOCK_BATCH_SIZE = 5

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const induceDelay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PaymentMessage {
  user: UserRecord
  paymentLog: ethers.Log
}

export class PaymentListener {
  private startBlock: number
  private initialized = false
  private jsonRpcProvider: ethers.JsonRpcProvider
  private logger: Logger

  // cache these since they never change
  private TRANSFER_TOPIC0 = ethers.id('Transfer(address,address,uint256)')
  private paymentSet: Set<string>

  constructor(
    private keyValueStore: PostgresKeyValueStore,
    private userStore: PostgresUserStore,
    private parsingKey: string,
    private defaultStartBlock: number,
    private confirmation: number,
    private rpcUrl: string,
    private queue: RabbitMQQueue<PaymentMessage>,
    private paymentTokens: string[],
  ) {
    this.startBlock = this.defaultStartBlock
    this.jsonRpcProvider = new ethers.JsonRpcProvider(this.rpcUrl)
    this.logger = makeLogger('PaymentListener')

    // normalize once
    this.paymentTokens = this.paymentTokens.map(ethers.getAddress)
    this.paymentSet = new Set(this.paymentTokens)

    this.logger.info('PaymentListener constructed', {
      defaultStartBlock: this.defaultStartBlock,
      confirmation: this.confirmation,
      rpcUrl: this.rpcUrl,
      paymentTokens: this.paymentTokens,
      parsingKey: this.parsingKey,
      CHUNK_SIZE,
      BLOCK_BATCH_SIZE,
      WAIT_TIME,
    })
  }

  private async init(): Promise<void> {
    if (!this.initialized) {
      this.logger.info('Init starting')
      this.startBlock = await this.getLastProcessedBlock()
      this.initialized = true
      this.logger.info('Init done', { startBlock: this.startBlock })
    }
  }

  private async getLastProcessedBlock(): Promise<number> {
    this.logger.debug('Fetching last processed block from kv', { parsingKey: this.parsingKey })
    const data = await this.keyValueStore.get(this.parsingKey)

    let startBlock: number
    if (data) {
      startBlock = parseInt(data)
      this.logger.info('Loaded last processed block from kv', { startBlock, raw: data })
    } else {
      startBlock = this.defaultStartBlock
      this.logger.info('No last processed block in kv; using default', { startBlock })
    }

    return startBlock
  }

  public async start(): Promise<void> {
    await this.init()

    this.logger.info('PaymentListener start loop', {
      startBlock: this.startBlock,
      confirmation: this.confirmation,
      blockBatchSize: BLOCK_BATCH_SIZE,
    })

    while (true) {
      try {
        const currentBlock = await this.jsonRpcProvider.getBlockNumber()
        this.logger.trace('Fetched current block', { currentBlock, startBlock: this.startBlock })

        // highest block we are allowed to process (confirmation-safe)
        const confirmedTip = currentBlock - this.confirmation
        if (confirmedTip < this.startBlock) {
          this.logger.debug('Not enough confirmations yet; sleeping', {
            currentBlock,
            confirmedTip,
            startBlock: this.startBlock,
            confirmation: this.confirmation,
            waitMs: WAIT_TIME,
          })
          await induceDelay(WAIT_TIME)
          continue
        }

        // process up to BLOCK_BATCH_SIZE blocks in one go, but never beyond confirmedTip
        const fromBlock = this.startBlock
        const toBlock = Math.min(fromBlock + BLOCK_BATCH_SIZE - 1, confirmedTip)

        this.logger.trace('Processing block range', {
          fromBlock,
          toBlock,
          confirmedTip,
          currentBlock,
          confirmation: this.confirmation,
        })

        const allLogs = await this.getLogsRange(fromBlock, toBlock)
        this.logger.trace('Fetched logs for range', {
          fromBlock,
          toBlock,
          totalLogs: allLogs.length,
        })

        const paymentLogs = this.getPaymentLogs(allLogs)
        this.logger.trace('Filtered payment logs', {
          fromBlock,
          toBlock,
          paymentLogs: paymentLogs.length,
        })

        if (paymentLogs.length > 0) {
          const recipients = paymentLogs.map((l) =>
            ethers.getAddress(ethers.dataSlice(l.topics[2], 12)),
          )
          const uniqueRecipients = Array.from(new Set(recipients))

          this.logger.debug('Recipients extracted', {
            fromBlock,
            toBlock,
            recipients: recipients.length,
            uniqueRecipients: uniqueRecipients.length,
          })

          const recipientChunks = chunk(uniqueRecipients, CHUNK_SIZE)
          this.logger.trace('Recipient chunks prepared', {
            chunks: recipientChunks.length,
            chunkSize: CHUNK_SIZE,
          })

          for (const batch of recipientChunks) {
            this.logger.trace('Querying db for recipient batch', { batchSize: batch.length })
            const recipientsInDb = await this.userStore.getUsersUsingPaymentsAddresses(batch)

            this.logger.debug('DB returned recipients', {
              queried: batch.length,
              inDb: recipientsInDb?.length ?? 0,
            })

            if (!recipientsInDb || recipientsInDb.length === 0) continue

            await this.runWithConcurrency(recipientsInDb, 10, async (user) => {
              await this.handlePaymentRecipient(user, paymentLogs)
            })
          }
        } else {
          this.logger.trace('No payment logs in this range')
        }

        // advance startBlock beyond processed range and persist
        await this.setLastProcessedBlock(toBlock + 1)
      } catch (error) {
        this.logger.error('error in payment listener', { error })
        // important: avoid hot looping on repeated failures
        await induceDelay(1000)
      }
    }
  }

  private async handlePaymentRecipient(user: UserRecord, paymentLogs: ethers.Log[]): Promise<void> {
    const userAddr = ethers.getAddress(user.evm_payment_address)
    const logsForUser =
      userAddr && userAddr !== '0x0000000000000000000000000000000000000000'
        ? paymentLogs.filter(
            (l) => ethers.getAddress(ethers.dataSlice(l.topics[2], 12)) === userAddr,
          )
        : paymentLogs

    this.logger.trace('Handling recipient', {
      user: user.userId,
      logsForUser: logsForUser.length,
      totalPaymentLogs: paymentLogs.length,
    })

    for (let index = 0; index < logsForUser.length; index++) {
      const paymentLog = logsForUser[index]
      this.logger.info('Found Payment', {
        user: user.userId,
        token: paymentLog.address,
        blockNumber: paymentLog.blockNumber,
        txHash: paymentLog.transactionHash,
        logIndex: paymentLog.index,
      })
      await this.queue.enqueue({ user, paymentLog })
    }
  }

  private async getLogsRange(fromBlock: number, toBlock: number): Promise<ethers.Log[]> {
    this.logger.trace('RPC getLogs range', {
      fromBlock,
      toBlock,
      tokenCount: this.paymentTokens.length,
    })

    const logs = await this.jsonRpcProvider.getLogs({
      fromBlock,
      toBlock,
      address: this.paymentTokens,
      // optional: you can pre-filter Transfer here too, reducing payload
      topics: [this.TRANSFER_TOPIC0],
    })

    return logs
  }

  private async setLastProcessedBlock(nextStartBlock: number): Promise<void> {
    const prev = this.startBlock
    this.startBlock = nextStartBlock
    await this.keyValueStore.set(this.parsingKey, this.startBlock.toString())
    this.logger.info('Advanced last processed block', { prevStartBlock: prev, nextStartBlock })
  }

  private getPaymentLogs(logs: ethers.Log[]): ethers.Log[] {
    // address filter is already done in getLogsRange, but we keep it in case you ever change that call.
    return logs.filter(
      (l) =>
        this.paymentSet.has(ethers.getAddress(l.address)) && l.topics?.[0] === this.TRANSFER_TOPIC0,
    )
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    this.logger.trace('runWithConcurrency start', { items: items.length, limit })

    const executing = new Set<Promise<void>>()

    for (const item of items) {
      const p = (async () => fn(item))().finally(() => executing.delete(p))
      executing.add(p)

      if (executing.size >= limit) {
        await Promise.race(executing)
      }
    }

    await Promise.all(executing)
    this.logger.trace('runWithConcurrency done', { items: items.length })
  }
}
