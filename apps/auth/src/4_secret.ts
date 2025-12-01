import { Wallet } from 'ethers'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { SiweMessage } from 'siwe'
import { config } from 'dotenv'

config()

export async function main() {
  const DOMAIN = process.env.DOMAIN!
  const SIWE_DOMAIN = process.env.SIWE_DOMAIN!

  const CHAIN_ID = Number(process.env.CHAIN_ID!)

  const wallet = new Wallet(process.env.PLATFORM_OWNER_PRIVATE_KEY!)

  const jar = new CookieJar()
  const client = wrapper(axios.create({ baseURL: `https://${DOMAIN}`, jar, withCredentials: true }))

  const {
    data: { nonce },
  } = await client.get<{ nonce: string }>('/siwe/nonce')

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

  await client.post('/siwe/verify', { message: prepared, signature })

  const storeSecret = await client.post('/storeSecret', {
    secretIdentifier: 'TEST_SECRET',
    secretData: 'thisisplainsecret',
  })
  console.log('storeSecret:', storeSecret.data)

  const readSecret = await client.post('/fetchSecret', {
    secretIdentifier: 'TEST_SECRET',
  })
  console.log('readSecret:', readSecret.data)

  const secretIdentifiers = await client.get('/fetchAllSecretIdentifiers')
  console.log('secretIdentifiers:', secretIdentifiers.data)

  const removeSecret = await client.post('/removeSecret', {
    secretIdentifier: 'TEST_SECRET',
  })
  console.log('removeSecret:', removeSecret.data)
}
