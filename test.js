import {getInfo} from './src/alza'
;(async function () {
  const products = [
    'sony-hi-res-wh-1000xm2-bezova-d5116750.htm',
    'rowenta-rh8895wo-airforce-extreme-32-4v-d4945936.htm',
    'dji-phantom-4-advanced-d4844052.htm',
    'macbook-pro-15-2016?dq=4534009&o=1',
    'sandisk-ultra-dual-usb-drive-3-0-16gb-d4421444.htm',
    'apple-earpods-with-remote-and-mic-d4799110.htm?o=2',
  ]

  const urls = [].concat(...products.map((u) => [`https://www.alza.sk/${u}`, `https://m.alza.sk/${u}`]))

  for (const url of urls) {
    const info = await getInfo(url)
    console.log(info)
  }
})()
