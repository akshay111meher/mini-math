import { Wallet } from 'ethers'
import { SiweMessage } from 'siwe'

export async function main() {
  const DOMAIN = 'localhost:3000'

  const CHAIN_ID = Number(process.env.CHAIN_ID ?? 1)

  const wallet = Wallet.createRandom()

  const nonce = '139438934'
  const msg = new SiweMessage({
    domain: DOMAIN,
    address: wallet.address,
    uri: `http://${DOMAIN}`,
    version: '1',
    chainId: CHAIN_ID,
    nonce,
  })

  const prepared = msg.prepareMessage() // canonical EIP-4361 string

  const signature = await wallet.signMessage(prepared)

  console.log(JSON.stringify({ message: prepared, signature }, null, 4))
}
