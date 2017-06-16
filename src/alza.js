import _request from 'request-promise'
import cheerio from 'cheerio'
import {URL} from 'url'

const jar = _request.jar()
const request = _request.defaults({
  headers: {'Content-Type': 'application/json'},
  jar,
})

const SCV='https://www.alza.sk/Services/EShopService.svc/'

export function* login(credentials) {
  return yield request.post(`${SCV}LoginUser`, {body: JSON.stringify(credentials)})
}

function getId(urlString) {
  const url = new URL(urlString)
  if (!url.hostname.endsWith('alza.sk')) throw new Error(`Invalid alza url: ${urlString}`)
  const dq = url.searchParams.get('dq')
  if (dq) return dq

  return url.pathname.match(/d(\d*)(\.htm)?$/)[1]
}

export function* addToCart({url, count}) {
  return yield request.post(`${SCV}OrderCommodity`, {body: JSON.stringify(
    {id: getId(url), count}
  )})
}

export function* getInfo(url) {
  const $ = cheerio.load(yield request(url))
  const name = $('h1[itemprop="name"]').text().trim().replace(/\s+/g, ' ')
  const price = parseFloat(
    $('span.price_withoutVat').text()
      .replace(/[^\d,]/g, '')
      .replace(/,/g, '.')
  )
  const description = $('div.nameextc').text()

  return {id: getId(url), name, price, description}
}
