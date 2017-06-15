import _request from 'request-promise'
import {run, createChannel} from 'yacol'
import WS from 'ws'

const API = 'https://slack.com/api/'

const request = _request.defaults({})

let state = {}

function* apiCall(name, token, data={}) {
  return JSON.parse(yield request.post(`${API}${name}`, {form: {...data, token}}))
}

export function* connect(token) {
  const response = yield run(apiCall, 'rtm.connect', token)
  state = {
    team: response.team,
    bot: response.self,
    token,
    channels: {},
  }

  const connection = new WS(response.url)
  const channel = createChannel()
  connection.on('message', (data) => channel.put(JSON.parse(data)))
  yield run(listen, channel)
}

function amIMentioned(event) {
  if (event.user === state.bot.id) return false
  if (event.channel[0] === 'D') return true
  if (event.text.match(`<@${state.bot.id}>`)) return true
  return false
}

function channelForUser(userId) {
  if (state.channels[userId] == null) {
    state.channels[userId] = createChannel()
    run(listenUser, state.channels[userId])
  }
  return state.channels[userId]
}

function* listen(channel) {
  while (true) {
    const event = yield channel.take()
    if (event.type === 'message' && event.subtype == null && amIMentioned(event)) {
      channelForUser(event.user).put(event)
    }
  }
}

function* listenUser(channel) {
  while (true) {
    const event = yield channel.take()
    yield run(apiCall, 'chat.postMessage', state.token,
              {channel: event.user, text: 'Thank you!', as_user: true})
  }
}
