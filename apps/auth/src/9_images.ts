import { Wallet } from 'ethers'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { SiweMessage } from 'siwe'
import { config } from 'dotenv'
import { GrantCreditDeltaSchemaType } from '@mini-math/rbac'
config()

const demoName = 'demoName'
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
  const client = wrapper(axios.create({ baseURL: DOMAIN, jar, withCredentials: true }))

  const {
    data: { nonce },
  } = await client.get<{ nonce: string }>('/siwe/nonce')

  const msg = new SiweMessage({
    domain: SIWE_DOMAIN,
    address: wallet.address,
    uri: SIWE_DOMAIN,
    version: '1',
    chainId: CHAIN_ID,
    nonce,
  })

  const prepared = msg.prepareMessage() // canonical EIP-4361 string
  const signature = await wallet.signMessage(prepared)

  await client.post('/siwe/verify', { message: prepared, signature })

  const meResult = await client.get('/me')
  console.log(meResult.data)

  const grantCreditPayload: GrantCreditDeltaSchemaType = {
    unifiedCredits: 10,
    userId: wallet.address,
  }
  const grantCreditsResult = await client.post('/grantCredits', grantCreditPayload)
  console.log(grantCreditsResult.data)

  const storeWorkflowResult = await client.post('/storeImage', {
    workflowName: demoName,
    core: demo_workflow,
  })
  console.log(storeWorkflowResult.data)

  const existImageResult = await client.post('/existImage', {
    workflowName: demoName,
  })
  console.log(existImageResult.data)

  const listImageResult = await client.post('/listImages')
  console.log(JSON.stringify(listImageResult.data))

  const countImageResult = await client.get('/countImages')
  console.log(countImageResult.data)

  const updateImageResult = await client.post('/updateImage', {
    workflowName: demoName,
    core: demo_workflow,
  })
  console.log(updateImageResult.data)

  const deleteImageResult = await client.post('/deleteImage', { workflowName: demoName })
  console.log(deleteImageResult.data)
}
