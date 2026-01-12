import 'hardhat/config'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-verify'

import { config } from 'dotenv'
config()

const PRIVATE_KEY = process.env.DEPLOYER_PK!
const RPC_URL = process.env.SEPOLIA_RPC_URL!
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_APIKEY!

export default {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
    },
  },
  verify: {
    etherscan: {
      apiKey: ETHERSCAN_API_KEY,
    },
  },
}
