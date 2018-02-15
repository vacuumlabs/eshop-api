import {run} from 'yacol'
import {getInfo} from './src/alza'
import {connect, listen, apiCall} from './src/slack'
import c from './src/config'

(async function() {
  const urls = [
    'https://www.alza.sk/sony-hi-res-wh-1000xm2-bezova-d5116750.htm',
    'https://www.alza.sk/rowenta-rh8895wo-airforce-extreme-32-4v-d4945936.htm',
    'https://www.alza.sk/dji-phantom-4-advanced-d4844052.htm',
    'https://www.alza.sk/macbook-pro-15-2016?dq=4534009&o=1',
    'https://www.alza.sk/sandisk-ultra-dual-usb-drive-3-0-16gb-d4421444.htm',
  ]

  for (const url of urls) {
    const info = await getInfo(url)
    console.log(info)
  }
})()
