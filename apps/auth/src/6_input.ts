import { Wallet } from 'ethers'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { SiweMessage } from 'siwe'
import { config } from 'dotenv'

config()

const demo_workflow = {
  name: 'zero',
  version: '1',
  nodes: [
    {
      id: '0000000000000000',
      type: 'test',
      name: 'increase',
      externalInputs: [{ id: 'xxxxxxxxxxx' }, { id: 'yyyyyyyyy' }],
    },
    { id: '1111111111111111', type: 'test', name: 'carpet' },
    { id: '2222222222222222', type: 'test', name: 'mail' },
    {
      id: '3333333333333333',
      type: 'test',
      name: 'hurry',
      externalInputs: [{ id: 'xxxxxxxxxxx' }, { id: 'yyyyyyyyy' }],
    },
    {
      id: '4444444444444444',
      type: 'test',
      name: 'wheat',
      externalInputs: [{ id: '0000000000000000' }, { id: '1111111111111111' }],
    },
    {
      id: '5555555555555555',
      type: 'test',
      name: 'oak',
      externalInputs: [{ id: '1111111111111111' }],
    },
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

  await client.post('/siwe/verify', { message: prepared, signature })

  await client.post('/grantRole', {
    user: wallet.address,
    role: 'Developer',
  })

  await client.post('/storeSecret', {
    secretIdentifier: 'TEST_SECRET',
    secretData: 'thisisplainsecret',
  })

  const workflow_load_result = await client.post<{ id: string }>('/load', demo_workflow)
  const id = workflow_load_result.data.id

  const workflow_schedule_result = await client.post<{ id: string }>('/schedule', {
    id,
    initiateWorkflowInMs: 1000,
  })
  console.log('workflow_schedule_result', workflow_schedule_result.data)

  await sleep(1000)
  for (;;) {
    let workflow_fetch_result = await client.post<{
      status: string
      result?: object
      expectingInputFor?: {
        node: string
        inputId: string
      }
    }>('/fetch', {
      id: workflow_load_result.data.id,
    })
    if (workflow_fetch_result.data.status == 'finished') {
      break
    }
    if (workflow_fetch_result.data.status == 'awaitingInput') {
      console.log(`Expecting Inputs, ${JSON.stringify(workflow_fetch_result.data)}`)

      try {
        const submitInputResult = await client.post<{ status: boolean }>('/externalInput', {
          id,
          nodeId: workflow_fetch_result.data.expectingInputFor?.node,
          externalInputId: workflow_fetch_result.data.expectingInputFor?.inputId,
          data: {
            name: 'something',
            type: 'json',
            value: { key1: 'key', key2: 'json', key3: 'acceptable', key4: 'string' },
          },
        })

        console.log('submitInputResult.data:', submitInputResult.data)
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          console.error('externalInput failed with 400 body:', err.response?.data)
        } else {
          console.error('externalInput failed with non-Axios error:', err)
        }
        // optionally break or rethrow
        break
      }
    }

    console.log(`Workflow ID: ${id}, Status: ${workflow_fetch_result.data.status}`)

    await sleep(50)
  }

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
