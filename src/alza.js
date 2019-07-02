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

      return resp
    })
  }

  async addToCartAll(items) {
    await this.login()

    for (const item of items) {
      const resp = await this.request.post(`${this.SVC}OrderCommodity`, {
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: item.shopId,
          count: item.count,
        }),
      })

      try {
        const respObj = JSON.parse(resp)

        if (respObj.d.ErrorLevel !== 0) {
          logger.log('error', 'Failed to add to cart', resp)
        }
      } catch (err) {
        logger.log('error', 'Failed to add to cart', err)
      }
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
      ).replace(/[^\d,.]/g, '').replace(/,/g, '.')
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

  return carts
}

export async function addToCartAll(items) {
  for (const [lang, langItems] of Object.entries(groupItemsByLang(items))) {
    if (langItems.length > 0) {
      await SHOPS[lang].addToCartAll(langItems)
    }
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

export async function alzaCode(req, res) {
  const {lang, code} = req.query

  let msg = ''

  if (lang && !SHOPS[lang]) {
    msg = 'Unknown language!'
  }

  if (lang && SHOPS[lang]) {
    await SHOPS[lang].login(code ? {validationCode: code} : {})
      .then((resp) => {
        const respObj = JSON.parse(resp)

        if (respObj.d.ErrorLevel === 0) {
          msg = `Login success: ${resp}`
        } else {
          msg = `Login failed: ${resp}`
        }
      })
      .catch((err) => {
        msg = `Login failed: ${err.message}`
      })
  }

  res.send(`
<html>
  <div>${msg}<div>
  <br>
  <form method="get" action="/alzacode">
    <div>Language: <select name="lang">
      <option value="">- - -</option>
      ${Object.entries(VERSIONS).map(([l, settings]) => `<option value="${l}"${lang === l ? ' selected="selected"' : ''}>${settings.domain} (${l})</option>`)}
    </select></div>
    <div>Code: <input type="text" name="code" value="${code || ''}" /></div>
    <div><button type="submit">Submit</button></div>
  </form>
</html>
  `)
}
