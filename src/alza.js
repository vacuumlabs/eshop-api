import _request from 'request-promise'
import cheerio from 'cheerio'
import {URL} from 'url'
import c from './config'

const BASE_URL = 'https://www.alza.sk/'

const jar = _request.jar()
jar.setCookie(_request.cookie(`refer3=${encodeURIComponent(`${BASE_URL};`)}`), BASE_URL)

const request = _request.defaults({
  headers: {
    'Content-Type': 'application/json',
    'referer': BASE_URL,
  },
  jar,
})

const SCV=`${BASE_URL}Services/EShopService.svc/`

export async function login(credentials) {
  return await request.post(`${SCV}LoginUser`, {body: JSON.stringify(credentials)})
}

function getId(urlString) {
  const url = new URL(urlString)
  if (!url.hostname.endsWith('alza.sk')) throw new Error(`Invalid alza url: ${urlString}`)
  const dq = url.searchParams.get('dq')
  if (dq) return dq

  return url.pathname.match(/d(\d*)(\.htm)?$/)[1]
}

export async function addToCart(id, count) {
  return await request.post(`${SCV}OrderCommodity`, {body: JSON.stringify(
    {id, count}
  )})
}

export async function getInfo(url) {
  url = url.replace('m.alza.sk', 'alza.sk')
  const $ = cheerio.load(await request(url))
  const name = (
    $('meta[name="twitter:title"]').attr('content') ||
    $('meta[property="og:title"]').attr('content')
  ).replace(/\| Alza.sk\s*$/, '').trim().replace(/\s+/g, ' ')

  const price =parseFloat((
    $('span.price_withoutVat').text() ||
    $('tr.pricenormal').find('td.c2').find('span').text()
  ).replace(/[^\d,]/g, '').replace(/,/g, '.')
  )
  const description = $('div.nameextc').text()

  return {id: getId(url), name, price, description}
}

export function alzaCode(req, res) {
  const data = {...c.alza.credentials}

  if (req.query.code) {
    data.validationCode = req.query.code
  }

  login(data)
    .then((resp) => {
      res.send(resp)
    })
    .catch((err) => {
      res.send(`Login failed: ${err.message}`)
    })
}
