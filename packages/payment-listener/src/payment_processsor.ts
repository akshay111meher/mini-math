import { RabbitMQQueue, PostgresTransactionStore, PostgresUserStore } from '@mini-math/adapters'
import { PaymentMessage } from './payment_listener.js'
import { Logger, makeLogger } from '@mini-math/logger'
import { UserStore } from '@mini-math/rbac'

const CREDITS_PER_USDC = 1000

type PaymentToken = { address: string; decimals: number; chainId: number }

export class PaymentProcessor {
  private logger: Logger
  private decimalsByToken = new Map<string, number>()
  private chainIdOfTOken = new Map<string, number>()

  constructor(
    private incoming_payments: RabbitMQQueue<PaymentMessage>,
    private payment_reconciliation_queue: RabbitMQQueue<string>,
    private transaction_store: PostgresTransactionStore,
    private user_store: PostgresUserStore,
    private paymentTokens: PaymentToken[],
  ) {
    this.logger = makeLogger('PaymentProcessor')

    for (const t of this.paymentTokens) {
      this.decimalsByToken.set(this.normalizeAddress(t.address), t.decimals)
      this.chainIdOfTOken.set(this.normalizeAddress(t.address), t.chainId)
    }

    this.configure()
  }

  private configure(): void {
    this.incoming_payments.onMessage(async (messageId: string, paymentMessage: PaymentMessage) => {
      await this.handleMessage(messageId, paymentMessage)
    })
  }

  private normalizeAddress(addr: string): string {
    return addr.toLowerCase()
  }

  private extractEvmInfo(paymentMessage: PaymentMessage): {
    tokenAddress: string
    txHash: string
    logIndex: number
  } {
    const log = paymentMessage.paymentLog

    const tokenAddress = log.address
    const txHash = (log as any).transactionHash ?? (log as any).txHash
    const logIndex = (log as any).index ?? (log as any).logIndex

    if (typeof tokenAddress !== 'string' || tokenAddress.length === 0) {
      throw new Error('paymentLog.address missing')
    }
    if (typeof txHash !== 'string' || txHash.length === 0) {
      throw new Error('paymentLog.transactionHash missing')
    }
    if (!Number.isFinite(logIndex)) {
      throw new Error('paymentLog.index/logIndex missing')
    }

    return {
      tokenAddress: this.normalizeAddress(tokenAddress),
      txHash: txHash.toLowerCase(),
      logIndex: Number(logIndex),
    }
  }

  /**
   * Convert a uint256 token amount into integer "credits" safely.
   *
   * Policy:
   * - credits = floor(raw * CREDITS_PER_USDC / 10^tokenDecimals)
   * - must be > 0
   * - must fit in JS safe integer because your CreditDelta expects number
   *
   * If you want fractional credits or huge credits, you must change CreditDelta to bigint/string.
   */
  private parsePaymentAmountToCreditsOrThrow(
    hexOrDec: unknown,
    tokenAddress: string,
    fieldName: string,
  ): number {
    if (typeof hexOrDec !== 'string') {
      throw new Error(`${fieldName} must be a string, got: ${typeof hexOrDec}`)
    }

    const s = hexOrDec.trim()
    if (!s) throw new Error(`${fieldName} must be non-empty`)

    let raw: bigint
    try {
      raw = BigInt(s) // handles both "0x..." and decimal strings
    } catch {
      throw new Error(`${fieldName} must be a uint256 string (0x… or decimal), got: ${s}`)
    }

    if (raw <= 0n) {
      throw new Error(`${fieldName} must be > 0, got: ${raw.toString(10)}`)
    }

    const normToken = this.normalizeAddress(tokenAddress)
    const decimals = this.decimalsByToken.get(normToken)
    if (decimals === undefined) {
      throw new Error(
        `Unknown payment token decimals for tokenAddress=${tokenAddress}. ` +
          `Did you pass it in paymentTokens?`,
      )
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
      throw new Error(`Invalid decimals=${decimals} for tokenAddress=${tokenAddress}`)
    }

    const scale = 10n ** BigInt(decimals)

    // IMPORTANT: exponentiation is **, NOT ^ (which is XOR).
    // credits = floor(raw * CREDITS_PER_USDC / 10^decimals)
    const credits = (raw * BigInt(CREDITS_PER_USDC)) / scale

    if (credits <= 0n) {
      throw new Error(
        `Payment too small after scaling: raw=${raw.toString(10)} decimals=${decimals} => credits=0`,
      )
    }

    if (credits > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `credits too large for JS number (max=${Number.MAX_SAFE_INTEGER}), got: ${credits.toString(
          10,
        )}`,
      )
    }

    return Number(credits)
  }

  private async handleMessage(messageId: string, paymentMessage: PaymentMessage): Promise<void> {
    try {
      this.logger.info(
        `Received payment-message. messageId=${messageId} payment=${JSON.stringify(paymentMessage)}`,
      )

      const userId = paymentMessage.user.userId

      const evm = this.extractEvmInfo(paymentMessage)

      const unifiedCredits = this.parsePaymentAmountToCreditsOrThrow(
        paymentMessage.paymentLog?.data,
        evm.tokenAddress,
        'paymentLog.data',
      )

      const chainId = this.chainIdOfTOken.get(evm.tokenAddress)
      if (!chainId) {
        throw new Error(`chain id of token is not found: ${evm.tokenAddress}`)
      }

      // 3) Compute idempotency keys for the *credit tx* (EVM source)
      const keys = UserStore.idempotencyKeysForIncreaseCreditsUsingEvmSource(
        userId,
        { unifiedCredits },
        {
          kind: 'purchase',
          chainId: 1,
          tokenAddress: evm.tokenAddress,
          txHash: evm.txHash,
          logIndex: evm.logIndex,
          meta: {
            messageId,
            paymentMessage,
          },
        },
      )

      if (!keys.unified) {
        throw new Error('Could not construct unified idempotency key for payment credit')
      }

      // 4) Idempotency guard (fast path)
      const already = await this.transaction_store.getByIdempotencyKey(userId, keys.unified)
      if (already) {
        this.logger.warn(
          `Payment already processed (idempotent). messageId=${messageId} userId=${userId} key=${keys.unified}`,
        )
        await this.incoming_payments.ack(messageId)
        return
      }

      // 5) Apply credit + write tx history
      await this.user_store.increaseCreditsUsingEvmSource(
        userId,
        { unifiedCredits },
        {
          kind: 'purchase',
          chainId,
          tokenAddress: evm.tokenAddress,
          txHash: evm.txHash,
          logIndex: evm.logIndex,
          meta: {
            messageId,
            paymentMessage,
          },
        },
      )

      // 6) ACK only after success
      await this.incoming_payments.ack(messageId)

      // 7) enqueue for reconciliation
      await this.payment_reconciliation_queue.enqueue(paymentMessage.user.evm_payment_address)

      this.logger.info(
        `Payment processed + credited. messageId=${messageId} userId=${userId} credits=${unifiedCredits}`,
      )
    } catch (err) {
      const e = err as any
      this.logger.error(
        `PaymentProcessor error messageId=${messageId}: ${e?.message ?? String(err)}`,
        {
          name: e?.name,
          message: e?.message,
          stack: e?.stack,
          err,
        },
      )

      await this.incoming_payments.nack(messageId, true)
    }
  }

  public async start(): Promise<void> {
    this.logger.info('Started')

    await new Promise<void>((resolve) => {
      const keepAlive = setInterval(() => {}, 1_000_000)

      const shutdown = async (signal: NodeJS.Signals) => {
        this.logger.info(`Received ${signal}. Shutting down payment processor...`)
        clearInterval(keepAlive)

        try {
          if (typeof this.incoming_payments.close === 'function') {
            await this.incoming_payments.close()
          }
        } catch (err) {
          this.logger.error('Error while closing queue', { err })
        }

        process.off('SIGINT', shutdown)
        process.off('SIGTERM', shutdown)
        resolve()
      }

      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })

    this.logger.error('payment processor stopped')
  }
}
