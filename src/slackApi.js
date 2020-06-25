import _request from 'request-promise'

import c from './config'

const API = 'https://slack.com/api/'

const request = _request.defaults({})

export function makeApiCall(name, data = {}) {
  for (const k in data) {
    if (typeof data[k] === 'object') data[k] = JSON.stringify(data[k])
  }

  return request.post(`${API}${name}`, {form: {...data, token: c.slack.botToken}})
}
