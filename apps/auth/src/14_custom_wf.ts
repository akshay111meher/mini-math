import { Wallet } from 'ethers'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { SiweMessage } from 'siwe'
import { config } from 'dotenv'

config()

const demo_workflow = {
  name: 'New Workflow',
  version: '1',
  nodes: [
    {
      id: 'node_1766433250291_o7waa2j85',
      type: 'trigger',
      executed: false,
      inputs: [],
      outputs: [
        {
          name: 'main',
          type: 'json',
          value: {},
        },
      ],
      name: 'Trigger',
      config: {
        triggerType: 'manual',
        description: '',
        uiMode: 'manual',
        ownerAddress: '0x89c27f76EEF3e09D798FB06a66Dd461d7d21f111',
      },
    },
    {
      id: 'node_1766433256185_g7x43eciy',
      type: 'decimalWallet',
      executed: false,
      inputs: [
        {
          name: 'main',
          type: 'json',
          value: {},
        },
      ],
      outputs: [
        {
          name: 'main',
          type: 'json',
          value: {},
        },
      ],
      name: 'Wallet Connection',
      config: {
        walletType: 'subwallet-auto',
        network: 'base',
        checkBalance: false,
        requestFaucet: false,
        uiMode: 'autonomous',
        ownerAddress: '0x89c27f76EEF3e09D798FB06a66Dd461d7d21f111',
      },
    },
    {
      id: 'node_1766433262499_7ktwl5juf',
      type: 'oneInchFusion',
      executed: false,
      inputs: [
        {
          name: 'main',
          type: 'json',
          value: {},
        },
      ],
      outputs: [
        {
          name: 'main',
          type: 'json',
          value: {},
        },
      ],
      name: '1inch',
      config: {
        fromToken: 'USDC',
        toToken: 'USDC',
        amount: '1',
        recipient: '',
        dstChain: 'base',
        preset: 'recommended',
        uiMode: 'manual',
        ownerAddress: '0x89c27f76EEF3e09D798FB06a66Dd461d7d21f111',
      },
    },
  ],
  edges: [
    {
      id: 'conn_1766433344450_vdy2qevqo',
      from: 'node_1766433250291_o7waa2j85',
      to: 'node_1766433256185_g7x43eciy',
    },
    {
      id: 'conn_1766433344450_8uqpe9pur',
      from: 'node_1766433256185_g7x43eciy',
      to: 'node_1766433262499_7ktwl5juf',
    },
  ],
  entry: 'node_1766433250291_o7waa2j85',
  globalState: {
    isActive: true,
  },
  exportedAt: '2025-12-22T19:56:04.068Z',
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

  const cookies1 = await jar.getCookies(`${DOMAIN}`) // from tough-cookie
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

  const grantPositiveCredits = await client.post('/grantCredits', {
    executionCredits: 10000,
    userId: wallet.address,
  })
  console.log(grantPositiveCredits.data)

  const workflow_load_result = await client.post<{ id: string }>('/load', demo_workflow)
  console.log('workflow_load_result', workflow_load_result.data)

  const workflow_initiate_result = await client.post<{ id: string }>('/initiate', {
    id: workflow_load_result.data.id,
  })
  console.log('workflow_initiate_result', workflow_initiate_result.data)

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  type FetchResult = {
    status: string
    result: unknown
  }

  while (true) {
    const workflow_fetch_result = await client.post<FetchResult>('/fetch', {
      id: workflow_load_result.data.id,
    })

    const { status, result } = workflow_fetch_result.data

    console.log(
      'workflow_fetch_result',
      JSON.stringify(
        {
          workflowId: workflow_load_result.data.id,
          status,
          workflow_trace: result,
          time: Date.now(),
        },
        null,
        4,
      ),
    )

    await sleep(1000)

    if (status === 'finished' || status === 'terminated') break
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
