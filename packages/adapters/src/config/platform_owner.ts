import { makeLogger } from '@mini-math/logger'
import { EvmPaymentAddressResolver, makePaymentResolver } from '@mini-math/rbac'
const logger = makeLogger('platformOwnerConfig')

export function getInitPlatformOwner(): string {
  const platform_owner =
    process.env.INIT_PLATFORM_OWNER ?? '0x29e78bB5ef59a7fa66606c665408D6E680F5a06f'
  logger.trace(`platform_owner: ${platform_owner}`)

  return platform_owner
}

export function getPaymentResolver(): EvmPaymentAddressResolver {
  if (!process.env.PAYMENT_KEY_DERIVATATION_SEED) {
    console.log('PAYMENT_KEY_DERIVATATION_SEED not defined')
    process.exit(1)
  }

  const seed = process.env.PAYMENT_KEY_DERIVATATION_SEED
  return makePaymentResolver(seed)
}
