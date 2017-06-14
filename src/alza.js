import _request from 'request-promise'

const jar = _request.jar()
const request = _request.defaults({
  headers: {'Content-Type': 'application/json'},
  jar,
})

const SCV='https://www.alza.sk/Services/EShopService.svc/'

export function* login(credentials) {
  return yield request.post(`${SCV}LoginUser`, {body: JSON.stringify(credentials)})
}

export function* addToCart(item, count) {
  return yield request.post(`${SCV}OrderCommodity`, {body: JSON.stringify(
    {id: item, count}
  )})
}
