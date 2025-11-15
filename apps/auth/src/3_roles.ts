import { Wallet } from 'ethers'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { SiweMessage } from 'siwe'

export async function main() {
  const DOMAIN = 'localhost:3000'

  const CHAIN_ID = Number(process.env.CHAIN_ID ?? 1)

  const wallet = new Wallet('c196684164f3523200c3df248ea65e78d11891f6e40b92016db4c77365d39b16')

  const jar = new CookieJar()
  const client = wrapper(axios.create({ baseURL: `http://${DOMAIN}`, jar, withCredentials: true }))

  const {
    data: { nonce },
  } = await client.get<{ nonce: string }>('/siwe/nonce')

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

  const verify = await client.post('/siwe/verify', { message: prepared, signature })
  console.log('verify:', verify.data)
  console.log('me:', (await client.get('/me')).data)

  const grant_role = await client.post('/grantRole', {
    user: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    role: 'Developer',
  })
  console.log('grant_role', grant_role.data)

  const revoke_role = await client.post('/revokeRole', {
    user: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    role: 'Developer',
  })
  console.log('revoke_role', revoke_role.data)

  console.log('logout:', (await client.post('/logout')).data)

  try {
    await client.get('/me')
    throw new Error('should not be accessible after logout')
  } catch {
    console.log('successfully failed after logout')
  }

  await jar.removeAllCookies()
  return 'Executed as expected'
}
