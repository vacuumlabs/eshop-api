import {run} from 'yacol'
import {getInfo} from './src/alza'
import {connect, listen, apiCall} from './src/slack'
import c from './src/config'

/*run(function*() {
  const urls = [
    'https://www.alza.sk/rowenta-rh8895wo-airforce-extreme-32-4v-d4945936.htm',
    'https://www.alza.sk/dji-phantom-4-advanced-d4844052.htm',
    'https://www.alza.sk/macbook-pro-15-2016?dq=4534009&o=1',
  ]

  for (const url of urls) {
    const info = yield run(getInfo, url)
    console.log(info)
  }
})*/

(async function() {
  await run(connect, c.slack.botToken)
  console.log(await apiCall('users.list'))
})()
