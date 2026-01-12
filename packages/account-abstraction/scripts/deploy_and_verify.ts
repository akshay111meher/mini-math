import hre from 'hardhat'

const ethers = hre.ethers

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function verify(address: string, constructorArguments: any[]) {
  try {
    await hre.run('verify:verify', {
      address,
      constructorArguments,
    })
    console.log(`Verified: ${address}`)
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    if (
      msg.toLowerCase().includes('already verified') ||
      msg.toLowerCase().includes('contract source code already verified')
    ) {
      console.log(`Already verified: ${address}`)
      return
    }
    console.log(`Verify failed for ${address}: ${msg}`)
  }
}

async function main() {
  const net = hre.network.name
  console.log(`Network: ${net}`)

  const [deployer] = await ethers.getSigners()
  console.log(`Deployer: ${deployer.address}`)

  // ---- Deploy MockERC20 ----
  // constructor(string name, string symbol, uint8 decimals, uint256 initialSupply)
  const mockName = 'Mock Token'
  const mockSymbol = 'MOCK'
  const mockDecimals = 18
  const initialSupply = ethers.parseUnits('1000000', mockDecimals) // 1,000,000 MOCK

  const Mock = await ethers.getContractFactory('MockERC20')
  const mock = await Mock.deploy(mockName, mockSymbol, mockDecimals, initialSupply)
  await mock.waitForDeployment()
  const mockAddr = await mock.getAddress()
  console.log(`MockERC20 deployed: ${mockAddr}`)

  // ---- Deploy Forwarder ----
  const Forwarder = await ethers.getContractFactory('TreasuryForwarder')
  const forwarder = await Forwarder.deploy()
  await forwarder.waitForDeployment()
  const forwarderAddr = await forwarder.getAddress()
  console.log(`TreasuryForwarder deployed: ${forwarderAddr}`)

  // ---- Verify (skip on local networks) ----
  if (net === 'hardhat' || net === 'localhost') {
    console.log('Skipping verification on local network.')
    return
  }

  // give the explorer a moment to index the bytecode
  console.log('Waiting before verification...')
  await sleep(15_000)

  await verify(mockAddr, [mockName, mockSymbol, mockDecimals, initialSupply])
  await verify(forwarderAddr, [])
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
