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
    streams: {},
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
  const stream = createChannel()
  connection.on('message', (data) => stream.put(JSON.parse(data)))
  return stream
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

function streamForUser(userId) {
  if (state.streams[userId] == null) {
    state.streams[userId] = createChannel()
    run(listenUser, state.streams[userId], userId)
  }
  return state.streams[userId]
}

export function* listen(stream) {
  while (true) {
    const event = yield stream.take()
    if (event.type === 'message' && event.subtype == null && amIMentioned(event)) {
      streamForUser(event.user).put(event)
    }
    if (event.type === 'action') {
      const actionStream = state.pendingActions[event.callback_id]
      if (actionStream) actionStream.put(event)
      else yield run(replaceWithError, event.channel.id, event.original_message.ts,
          'The order has timed out. Create a new order please.')
    }
  }
}

function* replaceWithError(channel, ts, msg) {
  yield run(apiCall, 'chat.update', {channel, ts, as_user: true, text: `:exclamation: ${msg}`, attachments: '[]'})
}

function* listenUser(stream, user) {
  const newOrder = () => ({
    id: null,
    items: [],
    totalPrice: 0,
    orderConfirmation: null,
  })

  function setId(order, newId) {
    if (order.id) delete state.pendingActions[order.id]
    if (newId) state.pendingActions[newId] = stream
    return {...order, id: newId}
  }

  function destroyOrder(order) {
    setId(order, null)
  }

  while (true) {
    let order = newOrder()

    while (true) {
      const event = yield stream.take()

      if (event.type === 'action') {
        yield run(finnishOrder, stream, order, event.actions[0].name, user)
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
    yield run(apiCall, 'chat.update', {channel, ts, as_user: true, attachments:
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
    console.log(c.approvalTreshold)
    yield run(apiCall, 'chat.postMessage', {
      channel: user, as_user: true, text:
        order.totalPrice < c.approvalTreshold
          ? `:question: Why do you need these items?`
          : `:question: This order is pretty high, who approved it?\n:question: Why do you need it?`
    })

    const event = yield stream.take()

    if (event.type === 'message') {
      yield run(updateMessage, {
        fields: [...attachment.fields, {title: 'Reason', value: event.text, short: false}],
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

  const [info, errors] = yield run(orderInfo, items)
  const orderAttachment = orderToAttachment(info, order.id)

  if (errors.length > 0) {
    yield run(apiCall, 'chat.postMessage', {
      channel: user,
      as_user: true,
      text: `:exclamation: I can't find these items:\n${errors.join('\n')}`,
    })
  }

  const orderConfirmation = yield run(apiCall, 'chat.postMessage', {
      channel: user,
      attachments: JSON.stringify([orderAttachment]),
      as_user: true,
  })

  return {...order, items, orderConfirmation, totalPrice: info.totalPrice}
}


function orderToAttachment(order, id) {
  const itemLines = order.items.map((item) => {
    const itemPrice = formatter.format(item.price).padStart(10)
    return `\`${itemPrice}\` <${item.url}|${item.count} x ${item.name}>`
  })

  return {
    title: `Order summary`,
    pretext: `Please confirm your order:`,
    fields: [
      {title: 'Items', value: itemLines.join('\n'), short: false},
      {title: 'Total value', value: formatter.format(order.totalPrice)},
    ],
    mrkdwn_in: ['fields'],
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
  let errors = []
  let totalPrice = 0
  yield run(login, c.alza.credentials)
  for (let item of items) {
    yield run(function*() {
      const itemInfo = yield run(getInfo, item.url)
      info.push({...itemInfo, count: item.count, url: item.url})
      totalPrice += itemInfo.price * item.count
    }).catch((e) => {
      errors.push(item.url)
    })
  }
  return [{items: info, totalPrice}, errors]
}
