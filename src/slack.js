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

function* apiCall(name, data={}) {
  return JSON.parse(yield request.post(`${API}${name}`, {form: {...data, token: state.token}}))
}

export function* connect(token) {
  state = {
    token,
    channels: {},
    pendingActions: {},
    actionsCount: 0,
  }

  const response = yield run(apiCall, 'rtm.connect')

  state = {
    ...state,
    team: response.team,
    bot: response.self,
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
  const newOrder = () => ({
    id: null,
    items: [],
    orderConfirmation: null,
  })

  function setId(order, newId) {
    if (order.id) delete state.pendingActions[order.id]
    if (newId) state.pendingActions[newId] = channel
    return {...order, id: newId}
  }

  function destroyOrder(order) {
    setId(order, null)
  }

  while (true) {
    let order = newOrder()

    while (true) {
      const event = yield channel.take()

      if (event.type === 'action') {
        yield run(finnishOrder, channel, order, event.actions[0].name, user)
        break
      }

      if (event.type === 'message') {
        order = setId(order, nextUUID())
        order = yield run(updateOrder, order, event, user)
      }
    }

    destroyOrder(order)
  }
}

function* finnishOrder(stream, order, action, user) {
  const {channel, ts, message: {attachments: [attachment]}} = order.orderConfirmation
  function* updateMessage(attachmentUpdate) {
    const r = yield run(apiCall, 'chat.update', {channel, ts, as_user: true, attachments:
              JSON.stringify([{...attachment, ...attachmentUpdate}])
    })
  }

  function* cancelOrder() {
    yield run(updateMessage, {
      pretext: `:no_entry_sign: Order canceled:`,
      color: 'danger',
      actions: [],
    })
  }

  if (action === 'cancel') yield run(cancelOrder)

  if (action === 'personal') {
    yield run(updateMessage, {
      pretext: `:woman: Personal order finished:`,
      color: 'good',
      actions: [],
    })
  }

  if (action === 'company') {
    yield run(updateMessage, {
      actions: [
        {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'},
      ],
    })
    yield run(apiCall, 'chat.postMessage', {
      channel: user, as_user: true, text: `:question: What's the reason for this company order?`
    })

    const event = yield stream.take()

    if (event.type === 'message') {
      yield run(updateMessage, {
        text: event.text,
        pretext: `:office: Company order finished:`,
        color: 'good',
        actions: [],
      })
      yield run(apiCall, 'chat.postMessage', {
        channel: user, as_user: true, text: `:office: Company order finished :point_up:`
      })
    }

    if (event.type === 'action') {
      yield run(cancelOrder)
      yield run(apiCall, 'chat.postMessage', {
        channel: user, as_user: true, text: `:no_entry_sign: Canceling :point_up:`
      })
    }

  }
}

function* updateOrder(order, event, user) {
  const items = [...order.items, ...parseOrder(event.text)]

  if (order.orderConfirmation) {
    const {channel, ts} = order.orderConfirmation
    yield run(apiCall, 'chat.delete', {channel, ts})
  }

  const orderAttachment = orderToAttachment(yield run(orderInfo, items), order.id)

  const orderConfirmation = yield run(apiCall, 'chat.postMessage', {
      channel: user,
      attachments: JSON.stringify([orderAttachment]),
      as_user: true,
  })

  return {...order, items, orderConfirmation}
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
