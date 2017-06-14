import _request from 'request-promise'

const request = _request.defaults({
  headers: {'Content-Type': 'application/json'},
  jar: _request.jar(),
})

const SCV='https://www.alza.sk/Services/EShopService.svc/'

export function* login(credentials) {
  return yield request.post(`${SCV}LoginUser`, {body: JSON.stringify(credentials)})
}
