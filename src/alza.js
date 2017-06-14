import _request from 'request-promise'
import cheerio from 'cheerio'

const jar = _request.jar()
const request = _request.defaults({
  headers: {'Content-Type': 'application/json'},
  jar,
})

const SCV='https://www.alza.sk/Services/EShopService.svc/'

export function* login(credentials) {
  return yield request.post(`${SCV}LoginUser`, {body: JSON.stringify(credentials)})
}

export function* addToCart({url, count}) {
  const id = url.match(/(d|dq=)(\d*)(\.htm)?$/)[2]
  return yield request.post(`${SCV}OrderCommodity`, {body: JSON.stringify(
    {id, count}
  )})
}

export function* getInfo(url) {
  const $ = cheerio.load(yield request(url))
  const name = $('h1[itemprop="name"]').text()
  const price = parseFloat(
    $('span.price_withoutVat').text()
      .replace(/[^\d,]/g, '')
      .replace(/,/g, '.')
  )
  const description = $('div.nameextc').text()

  return {name, price, description}
}
