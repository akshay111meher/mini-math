import { main as main1 } from './1_e2e.js'
import { main as main2 } from './2_generate_signed_message.js'
import { main as main3 } from './3_roles.js'

// This is not right way to test, but comment out tests you don't want
async function main() {
  await main1()
  await main2()
  await main3()

  return 'Done'
}

main().then(console.log).catch(console.error)
