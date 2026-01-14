import { main as main0 } from './0_credits.js'
import { main as main1 } from './1_e2e.js'
import { main as main2 } from './2_generate_signed_message.js'
import { main as main3 } from './3_roles.js'
import { main as main4 } from './4_secret.js'
import { main as main5 } from './5_schedule.js'
import { main as main6 } from './6_input.js'
import { main as main7 } from './7_cron.js'
import { main as main8 } from './8_stress.js'
import { main as main9 } from './9_images.js'
import { main as main10 } from './10_credits.js'
import { main as main11 } from './11_feHelpers.js'
import { main as main12 } from './12_batch.js'
import { main as main13 } from './13_error_node.js'
import { main as main14 } from './14_custom_wf.js'
import { main as main15 } from './15_transactions.js'

// This is not right way to test, but comment out tests you don't want
async function main() {
  await main0()
  console.log('############### main 0 ###############')
  await main1()
  console.log('############### main 1 ###############')
  await main2()
  console.log('############### main 2 ###############')
  await main3()
  console.log('############### main 3 ###############')
  await main4()
  console.log('############### main 4 ###############')
  await main5()
  console.log('############### main 5 ###############')
  await main6()
  console.log('############### main 6 ###############')
  await main7()
  console.log('############### main 7 ###############')
  await main8()
  console.log('############### main 8 ###############')
  await main9()
  console.log('############### main 9 ###############')
  await main10()
  console.log('############### main 10 ###############')
  await main11()
  console.log('############### main 11 ###############')
  await main12()
  console.log('############### main 12 ###############')
  await main13()
  console.log('############### main 13 ###############')
  await main14()
  console.log('############### main 14 ###############')
  await main15()
  console.log('############### main 15 ###############')

  return 'Done'
}

main()
  .then(console.log)
  .catch(function (ex) {
    console.error(JSON.stringify(ex, null, 4))
  })
