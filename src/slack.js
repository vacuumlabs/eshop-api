import c from './config'
import _request from 'request-promise'
import {run, createChannel} from 'yacol'
import {login, getInfo} from './alza'
import WS from 'ws'

const API = 'https://slack.com/api/'

const request = _request.defaults({})

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

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
    pendingActions: {},
    actionsCount: 0,
  }

  const connection = new WS(response.url)
  const channel = createChannel()
  connection.on('message', (data) => channel.put(JSON.parse(data)))
  return channel
}

function nextUUID() {
  return (`${Date.now()}#${state.actionsCount++}`)
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
    run(listenUser, state.channels[userId], userId)
  }
  return state.channels[userId]
}

export function* listen(channel) {
  while (true) {
    const event = yield channel.take()
    if (event.type === 'message' && event.subtype == null && amIMentioned(event)) {
      channelForUser(event.user).put(event)
    }
    if (event.type === 'action') {
      state.pendingActions[event.callback_id].put(event)
    }
  }
}

function* listenUser(channel, user) {
  let id = null
  let order = []

  function setId(newId) {
    if (id) delete state.pendingActions[id]
    if (newId) state.pendingActions[newId] = channel
    id = newId
  }

  while (true) {
    const event = yield channel.take()

    if (event.type === 'action') {
      yield run(finnishOrder, event.actions[0].name, user)
      setId(null)
    } else if (event.type === 'message') {
      setId(nextUUID())
      order = yield run(updateOrder, id, order, event, user)
    }
  }
}

function* finnishOrder(action, user) {
  yield run(apiCall, 'chat.postMessage', state.token, {
    channel: user,
    text: `${action} rulez!`,
    as_user: true,
  })
}

function* updateOrder(id, order, event, user) {
  order = [...order, ...parseOrder(event.text)]

  const orderAttachment = orderToAttachment(yield run(orderInfo, order), id)

  yield run(apiCall, 'chat.postMessage', state.token, {
      channel: user,
      attachments: JSON.stringify([orderAttachment]),
      as_user: true,
  })

  return order
}


function orderToAttachment(order, id) {
  const fields = order.items.map((item) => {
    const itemSum = formatter.format(item.count * item.price)
    const itemPrice = formatter.format(item.price)
    return {
      title: `${item.count} x ${item.name}`,
      value: `<${item.url}|${itemSum} (${item.count} x ${itemPrice})>`,
      short: true,
    }
  })

  return {
    title: `Total value: ${formatter.format(order.totalPrice)}`,
    pretext: `Please confirm your order:`,
    fields,
    callback_id: id,
    actions: [
      {name: 'personal', text: 'Make Personal Order', type: 'button', value: 'personal'},
      {name: 'company', text: 'Make Company Order', type: 'button', value: 'company'},
      {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'},
    ],
  }

}

function parseOrder(text) {
  const re = /\s*(\d*)\s*<(http[^\s]+)>/g
  let matches
  let goods = []
  while ((matches = re.exec(text)) !== null) {
    if (matches[1] === '') matches[1] = '1'
    goods.push({url: matches[2], count: parseInt(matches[1])})
  }
  return goods
}

function* orderInfo(items) {
  let info = []
  let totalPrice = 0
  yield run(login, c.alza.credentials)
  for (let item of items) {
    const itemInfo = yield run(getInfo, item.url)
    info.push({...itemInfo, count: item.count, url: item.url})
    totalPrice += itemInfo.price * item.count
  }
  return {items: info, totalPrice}
}
