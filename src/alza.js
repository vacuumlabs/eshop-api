import _request from 'request-promise'
import cheerio from 'cheerio'
import {URL} from 'url'
import c from './config'
import {convert} from './currency'
import logger from 'winston'

const LOGGED_IN_TIME = 60 * 1000

class Alza {
  constructor({domain, currency}, credentials) {
    this.domain = domain
    this.currency = currency
    this.credentials = credentials

    this.baseUrl = `https://www.${domain}/`
    this.SVC = `${this.baseUrl}Services/EShopService.svc/`

    const jar = _request.jar()
    jar.setCookie(_request.cookie(`refer3=${encodeURIComponent(`${this.baseUrl};`)}`), this.baseUrl)

    this.request = _request.defaults({
      headers: {
        Referer: this.baseUrl,
      },
      jar,
    })

    this.lastLoggedIn = 0
  }

  login(data) {
    if (!data && Date.now() - this.lastLoggedIn < LOGGED_IN_TIME) {
      return Promise.resolve(null)
    }
console.log("ALZA LOGGING IN")
    return this.request.post(`${this.SVC}LoginUser`, {
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...this.credentials,
        ...data,
      }),
    }).then((resp) => {
      if (!data) {
        try {
          const respObj = JSON.parse(resp)

          if (respObj.d.ErrorLevel === 0) {
            this.lastLoggedIn = Date.now()
          } else {
            logger.log('error', 'Failed to login to alza', resp)
          }
        } catch (err) {
          logger.log('error', 'Failed to login to alza', err)
        }
      }
console.log("ALZA LOG IN RESULT", resp)
      return resp
    })
  }

  async addToCartAll(items) {
    await this.login()

    for (const item of items) {
      await this.request.post(`${this.SVC}OrderCommodity`, {
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: item.id,
          count: item.count,
        }),
      })
    }
  }

  parseUrl(url) {
    return url.replace(`m.${this.domain}`, this.domain)
  }

  async getInfo(url) {
    const id = getId(url)

    if (!id) {
      return null
    }

    await this.login()

    const $ = cheerio.load(await this.request(this.parseUrl(url)))

    const name = (
      $('meta[name="twitter:title"]').attr('content') ||
      $('meta[property="og:title"]').attr('content')
    ).replace(new RegExp(`\\| ${this.domain}\\s*$`, 'i'), '').trim().replace(/\s+/g, ' ')

    const price = parseFloat(
      (
        $('span.price_withoutVat').text() ||
        $('tr.pricenormal').find('td.c2').find('span').text()
      ).replace(/[^\d,]/g, '').replace(/,/g, '.')
    )

    const priceConverted = await convert(price, this.currency, c.currency)

    const description = $('div.nameextc').text()

    return {
      id,
      name,
      description,
      price: priceConverted,
      priceOrig: price,
      currency: this.currency,
    }
  }
}

const VERSIONS = {
  sk: {
    domain: 'alza.sk',
    currency: 'EUR',
  },
  cz: {
    domain: 'alza.cz',
    currency: 'CZK',
  },
}

const SHOPS = Object.entries(VERSIONS).reduce((acc, [lang, settings]) => ({
  ...acc,
  [lang]: new Alza(settings, c.alza.credentials[lang]),
}), {})

function getId(urlString) {
  const url = new URL(urlString)
  const dq = url.searchParams.get('dq')
  return dq || url.pathname.match(/d(\d*)(\.htm)?$/)[1]
}

function getLangByLink(link) {
  const url = new URL(link)

  return Object.keys(VERSIONS).find((lang) => url.hostname.endsWith(VERSIONS[lang].domain))
}

function groupItemsByLang(items) {
  const carts = Object.keys(VERSIONS).reduce((acc, lang) => ({
    ...acc,
    [lang]: [],
  }), {})

  for (const item of items) {
    const lang = getLangByLink(item.url)

    if (lang) {
      carts[lang].push(item)
    }
  }

  return items
}

export async function addToCartAll(items) {
  for (const [lang, langItems] of Object.entries(groupItemsByLang(items))) {
    await langItems.length > 0 && SHOPS[lang].addToCartAll(langItems)
  }
}

export function getInfo(link) {
  const lang = getLangByLink(link)

  return lang && SHOPS[lang].getInfo(link)
}

export function getCurrencyByLink(link) {
  const lang = getLangByLink(link)

  return lang && VERSIONS[lang] && VERSIONS[lang].currency
}

export function alzaCode(req, res) {
  const lang = req.query.lang

  if (!lang) {
    res.send('Specify lang parameter')
    return
  }

  if (!SHOPS[lang]) {
    res.send(`Unknown lang '${lang}`)
    return
  }

  SHOPS[lang].login({validationCode: req.query.code})
    .then((resp) => {
      res.send(resp)
    })
    .catch((err) => {
      res.send(`Login failed: ${err.message}`)
    })
}
