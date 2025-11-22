import { main as main1 } from './1_e2e.js'
import { main as main2 } from './2_generate_signed_message.js'
import { main as main3 } from './3_roles.js'
import { main as main4 } from './4_secret.js'
import { main as main5 } from './5_schedule.js'
import { main as main6 } from './6_input.js'

// This is not right way to test, but comment out tests you don't want
async function main() {
  await main1()
  await main2()
  await main3()
  await main4()
  await main5()
  await main6()

  return 'Done'
}

main()
  .then(console.log)
  .catch(function (ex) {
    console.error(JSON.stringify(ex, null, 4))
  })
