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

  const batchJobCreateRequest = await client.post<{
    data: { batchId: string; workflowIds: string[] }
  }>('/batchJobs/createBatch', {
    workflowCore: demo_workflow,
    schedulesInMs: [1000, 10000, 25000],
  })
  console.log('batchJobCreateRequest:', batchJobCreateRequest.data)

  const batchExistsCheck = await client.post<{ status: boolean }>('/batchJobs/existsBatch', {
    batchId: batchJobCreateRequest.data.data.batchId,
  })
  console.log('batchExistsCheck:', batchExistsCheck.data)

  // read state of each workflow

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  for (let index = 0; index < batchJobCreateRequest.data.data.workflowIds.length; index++) {
    const workflowId = batchJobCreateRequest.data.data.workflowIds[index]

    while (true) {
      const workflow_fetch_result = await client.post<{ status: string }>('/fetch', {
        id: workflowId,
      })
      const { status } = workflow_fetch_result.data

      console.log('workflow_fetch_result', { workflowId, status })
      
      // avoid hammering the server
      await sleep(1000) // tune as needed
      
      if (status === 'idle') continue

    }

    // idle now -> continue to next workflowId
  }
}
