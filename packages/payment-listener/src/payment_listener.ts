import { PostgresUserStore, PostgresKeyValueStore, RabbitMQQueue } from '@mini-math/adapters'
import { makeLogger, Logger } from '@mini-math/logger'
import { ethers } from 'ethers'
import { UserRecord } from '@mini-math/rbac'

const WAIT_TIME = 12000
const CHUNK_SIZE = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const induceDelay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

interface LogAndBlock {
  logDescription: ethers.LogDescription
  block: number
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
    this.paymentTokens = this.paymentTokens.map(ethers.getAddress)
  }

  private async init(): Promise<void> {
    if (!this.initialized) {
      this.startBlock = await this.getLastProcessedBlock()
      this.initialized = true
    }
  }

  private async getLastProcessedBlock(): Promise<number> {
    const data = await this.keyValueStore.get(this.parsingKey)
    let startBlock: number
    if (data) {
      startBlock = parseInt(data)
    } else {
      startBlock = this.defaultStartBlock
    }

    return startBlock
  }

  public async start(): Promise<void> {
    await this.init()
    while (true) {
      try {
        const currentBlock = await this.jsonRpcProvider.getBlockNumber()

        if (currentBlock < this.startBlock + this.confirmation) {
          await induceDelay(WAIT_TIME)
          continue
        }

        const allLogs = await this.getBlockLogs(this.startBlock)
        const paymentLogs = this.getPaymentLogs(allLogs)

        const recipients = paymentLogs.map((l) =>
          ethers.getAddress(ethers.dataSlice(l.topics[2], 12)),
        )
        const uniqueRecipients = Array.from(new Set(recipients))

        const recipientChunks = chunk(uniqueRecipients, CHUNK_SIZE)

        for (const batch of recipientChunks) {
          const recipientsInDb = await this.userStore.getUsersUsingPaymentsAddresses(batch)

          if (!recipientsInDb || recipientsInDb.length === 0) continue

          await this.runWithConcurrency(recipientsInDb, 10, (user) =>
            this.handlePaymentRecipient(user, paymentLogs),
          )
        }

        await this.increaseLastProcessedBlock()
      } catch (error) {
        this.logger.error('error in payment listener', { error })
      }
    }

    return
  }

  private async handlePaymentRecipient(user: UserRecord, paymentLogs: ethers.Log[]): Promise<void> {
    for (let index = 0; index < paymentLogs.length; index++) {
      const paymentLog = paymentLogs[index]
      console.log({ user, paymentLog })
      // await this.queue.enqueue({ user, paymentLog })
    }
  }

  private async getBlockLogs(blockNumber: number): Promise<ethers.Log[]> {
    const logs = await this.jsonRpcProvider.getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
      address: this.paymentTokens,
    })

    return logs
  }

  private async increaseLastProcessedBlock(): Promise<void> {
    this.startBlock++
    await this.keyValueStore.set(this.parsingKey, this.startBlock.toString())
  }

  private getPaymentLogs(logs: ethers.Log[]): ethers.Log[] {
    const paymentSet = new Set(this.paymentTokens.map((a) => ethers.getAddress(a)))

    const TRANSFER_TOPIC0 = ethers.id('Transfer(address,address,uint256)')

    return logs.filter(
      (l) => paymentSet.has(ethers.getAddress(l.address)) && l.topics?.[0] === TRANSFER_TOPIC0,
    )
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    const executing = new Set<Promise<void>>()

    for (const item of items) {
      const p = (async () => fn(item))().finally(() => executing.delete(p))
      executing.add(p)

      if (executing.size >= limit) {
        await Promise.race(executing)
      }
    }

    await Promise.all(executing)
  }
}
