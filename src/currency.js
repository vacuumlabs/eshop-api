import _request from 'request-promise'

const API_URL = 'http://free.currencyconverterapi.com/api/v5/convert?q={from}_{to}&compact=y'
const FRESH_MAX = 30 * 60 * 1000
const RATES = {}
const FORMATTERS = {}

const request = _request.defaults({})

export async function getRate(from, to) {
  const code = `${from}_${to}`

  if (!RATES[code] || Date.now() - RATES[code].datestamp > FRESH_MAX) {
    const resp = await request.get(API_URL.replace('{from}', from).replace('{to}', to))
    const data = JSON.parse(resp)

    RATES[code] = {
      rate: data[code].val,
      datestamp: Date.now(),
    }
  }

  return RATES[code].rate
}

export async function convert(value, from, to) {
  if (from === to) {
    return value
  }

  const rate = await getRate(from, to)

  return value * rate
}

export function getFormatter(currency) {
  if (!FORMATTERS[currency]) {
    FORMATTERS[currency] = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    })
  }

  return FORMATTERS[currency]
}

export function format(value, currency) {
  return getFormatter(currency).format(value)
}
