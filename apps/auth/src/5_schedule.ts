import { Wallet } from 'ethers'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { SiweMessage } from 'siwe'
import { config } from 'dotenv'

config()

const demo_workflow = {
  id: 'workflow-id-1234',
  name: 'zero',
  version: '1',
  nodes: [
    { id: '0000000000000000', type: 'test', name: 'increase' },
    { id: '1111111111111111', type: 'test', name: 'carpet' },
    { id: '2222222222222222', type: 'test', name: 'mail' },
    { id: '3333333333333333', type: 'test', name: 'hurry' },
    { id: '4444444444444444', type: 'test', name: 'wheat' },
    { id: '5555555555555555', type: 'test', name: 'oak' },
  ],
  edges: [
    { id: 'aaaaaaaaaaaaaaaa', from: '0000000000000000', to: '1111111111111111' },
    { id: 'bbbbbbbbbbbbbbbb', from: '0000000000000000', to: '2222222222222222' },
    { id: 'cccccccccccccccc', from: '1111111111111111', to: '3333333333333333' },
    { id: 'dddddddddddddddd', from: '1111111111111111', to: '4444444444444444' },
    { id: 'eeeeeeeeeeeeeeee', from: '3333333333333333', to: '5555555555555555' },
    { id: 'ffffffffffffffff', from: '4444444444444444', to: '5555555555555555' },
    { id: 'gggggggggggggggg', from: '2222222222222222', to: '5555555555555555' },
  ],
  entry: '0000000000000000',
  globalState: [{ init: 'this is json' }],
}

export async function main() {
  const DOMAIN = process.env.DOMAIN!
  const SIWE_DOMAIN = process.env.SIWE_DOMAIN!

  const CHAIN_ID = Number(process.env.CHAIN_ID!)

  const wallet = new Wallet(process.env.PLATFORM_OWNER_PRIVATE_KEY!)

  const jar = new CookieJar()
  const client = wrapper(axios.create({ baseURL: `http://${DOMAIN}`, jar, withCredentials: true }))

  const {
    data: { nonce },
  } = await client.get<{ nonce: string }>('/siwe/nonce')

  const msg = new SiweMessage({
    domain: SIWE_DOMAIN,
    address: wallet.address,
    uri: `http://${SIWE_DOMAIN}`,
    version: '1',
    chainId: CHAIN_ID,
    nonce,
  })

  const cookies1 = await jar.getCookies(`http://${DOMAIN}`) // from tough-cookie
  console.log(cookies1)

  const prepared = msg.prepareMessage() // canonical EIP-4361 string

  const signature = await wallet.signMessage(prepared)
  console.log(JSON.stringify({ message: prepared, signature }, null, 4))

  const verify = await client.post('/siwe/verify', { message: prepared, signature })
  console.log('verify:', verify.data)
  console.log('me:', (await client.get('/me')).data)

  const cookies2 = await jar.getCookies(`http://${DOMAIN}`) // from tough-cookie
  console.log(cookies2)
  const sid = cookies2.find((c) => c.key === 'sid')?.value // cookie name must match your express-session name
  console.log('SID for Swagger (paste this in Authorize):', sid)

  const grant_role = await client.post('/grantRole', {
    user: wallet.address,
    role: 'Developer',
  })
  console.log('grant_role', grant_role.data)

  const storeSecret = await client.post('/storeSecret', {
    secretIdentifier: 'TEST_SECRET',
    secretData: 'thisisplainsecret',
  })
  console.log('storeSecret:', storeSecret.data)

  const workflow_run = await client.post('/run', { ...demo_workflow, owner: wallet.address })
  console.log('workflow_run', workflow_run.data)

  const workflow_load_result = await client.post<{ id: string }>('/load', demo_workflow)
  console.log('workflow_load_result', workflow_load_result.data)

  const workflow_schedule_result = await client.post<{ id: string }>('/schedule', {
    id: workflow_load_result.data.id,
    initiateWorkflowInMs: 6000,
  })
  console.log('workflow_schedule_result', workflow_schedule_result.data)

  const workflow_fetch_result = await client.post<{ id: string }>('/fetch', {
    id: workflow_load_result.data.id,
  })
  console.log('workflow_fetch_result', workflow_fetch_result.data)

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
