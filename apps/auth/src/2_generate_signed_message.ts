import { Wallet } from 'ethers'
import { SiweMessage } from 'siwe'
import { config } from 'dotenv'
config()

export async function main() {
  const SIWE_DOMAIN = process.env.SIWE_DOMAIN!
  const CHAIN_ID = Number(process.env.CHAIN_ID!)

  const wallet = Wallet.createRandom()

  const nonce = '087d614c9dcb21de7944d9974324a20e'
  const msg = new SiweMessage({
    domain: SIWE_DOMAIN,
    address: wallet.address,
    uri: `https://${SIWE_DOMAIN}`,
    version: '1',
    chainId: CHAIN_ID,
    nonce,
  })

  const prepared = msg.prepareMessage() // canonical EIP-4361 string

  const signature = await wallet.signMessage(prepared)

  console.log(JSON.stringify({ message: prepared, signature }, null, 4))
}
