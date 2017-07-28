import c from './config'
import _knex from 'knex'
import _request from 'request-promise'
import {createChannel} from 'yacol'
import {login, getInfo, addToCart} from './alza'
import {create as createRecord} from './airtable'
import WS from 'ws'
import logger from 'winston'

const API = 'https://slack.com/api/'

const request = _request.defaults({})
const knex = _knex(c.knex)

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

let state = {}

export async function apiCall(name, data={}) {
  for (const k in data) {
    if (typeof data[k] === 'object') data[k] = JSON.stringify(data[k])
  }

  logger.log('verbose', `call slack.api.${name}`, data)
  const response = JSON.parse(await request.post(`${API}${name}`, {form: {...data, token: state.token}}))
  logger.log('verbose', `response slack.api.${name}`, {args: data, response})

  return response
}

export async function connect(token) {
  state = {
    token,
    streams: {},
    pendingActions: {},
    actionsCount: 0,
  }

  const response = await apiCall('rtm.connect')

  state = {
    ...state,
    team: response.team,
    bot: response.self,
  }

  const connection = new WS(response.url)
  const stream = createChannel()
  connection.on('message', (data) => stream.put(JSON.parse(data)))

  logger.log('info', 'WS connection to Slack established', {...state, token: '[SECRET]'})
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

function isMessage(event) {
  return event.type === 'message' && event.subtype == null
}

function streamForUser(userId) {
  if (state.streams[userId] == null) {
    state.streams[userId] = createChannel()
    listenUser(state.streams[userId], userId)
  }
  return state.streams[userId]
}

async function announceToAll(message) {
  const users =
    (await apiCall('users.list'))
      .members
      .filter((u) => u.is_bot === false)

  for (const u of users) {
    if (message === 'help') await greetNewUser(u.id)
    else await apiCall('chat.postMessage', {channel: u.id, as_user: true, text: message})
  }
}

async function greetNewUser(user) {
  await apiCall('chat.postMessage', {channel: user, as_user: true, text:
    `Hi!
I will get you anything from www.alza.sk. Use me for both your personal and company orders.

DM me with Alza links and I'll order them. Like this:
> https://www.alza.sk/cool-smartphone https://www.alza.sk/cool-chopter https://www.alza.sk/cool-cooler

Do you want to order 3 Cool Coolers and 2 Cool Smartphones? Just tell me so:
> 3 https://www.alza.sk/cool-cooler 2 https://www.alza.sk/cool-smartphone

Happy shopping!

PS: Feel free to contribute at https://github.com/vacuumlabs/eshop-api`})

}

export async function listen(stream) {
  for (;;) {
    const event = await stream.take()
    logger.log('verbose', `slack event ${event.type}`, event)

    if (isMessage(event) && amIMentioned(event)) {
      streamForUser(event.user).put(event)
      continue
    }

    if (isMessage(event) && event.channel === c.newsChannel) {
      await announceToAll(event.text)
      continue
    }

    if (event.type === 'team_join') {
      await greetNewUser(event.user.id)
      continue
    }

    if (event.type === 'action') {
      if (event.callback_id.startsWith('O')) {
        await handleOrderAction(event)
          .catch((e) => showError(event.channel.id, null, 'Something went wrong.'))
        continue
      }

      const actionStream = state.pendingActions[event.callback_id]
      if (actionStream) {actionStream.put(event)} else {
        await showError(event.channel.id, event.original_message.ts,
          'The order has timed out. Create a new order please.')
      }
    }
  }
}

async function showError(channel, ts, msg) {
  await apiCall(ts ? 'chat.update' : 'chat.postMessage', {
    channel, ts, as_user: true, text: `:exclamation: ${msg}`, attachments: [],
  })
}

async function listenUser(stream, user) {
  const newOrder = () => ({
    id: null,
    items: new Map(),
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

  for (;;) {
    let order = newOrder()

    for (;;) {
      const event = await stream.take()

      if (event.type === 'action') {
        await finishOrder(stream, order, event.actions[0].name, user)
        break
      }

      if (event.type === 'message') {
        order = setId(order, nextUUID())
        order = await updateOrder(order, event, user)
      }
    }

    destroyOrder(order)
  }
}

async function handleOrderAction(event) {
  const orderId = event.actions[0].value
  const items = await knex.select('shopId', 'count').from('orderItem').where('order', orderId)

  const msg = event.original_message
  const attachment = msg.attachments[0]
  const action = attachment.actions[0]

  await apiCall('chat.update', {channel: event.channel.id, ts: msg.ts, attachments: [{
    ...attachment,
    actions: [{...action, text: 'Add to Cart Again', style: 'default'}],
  }]})

  await login(c.alza.credentials)
  for (const item of items) await addToCart(item.shopId, item.count)
}

async function finishOrder(stream, order, action, user) {
  const {channel, ts, message: {attachments: [attachment]}} = order.orderConfirmation
  async function updateMessage(attachmentUpdate) {
    await apiCall('chat.update', {channel, ts, as_user: true,
      attachments: [{...attachment, ...attachmentUpdate}],
    })
  }

  async function cancelOrder() {
    await updateMessage({
      pretext: ':no_entry_sign: Order canceled:',
      color: 'danger',
      actions: [],
    })
  }

  if (action === 'cancel') await cancelOrder()

  if (action === 'personal') {
    const dbId = await storeOrder({user, ts, isCompany: false}, order.items)
    await notifyOfficeManager(order, dbId, user, false)
    await updateMessage({
      pretext: ':woman: Personal order finished:',
      color: 'good',
      actions: [],
    })
  }

  if (action === 'company') {
    await updateMessage({
      actions: [
        {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'},
      ],
    })
    await apiCall('chat.postMessage', {
      channel: user, as_user: true, text:
        order.totalPrice < c.approvalTreshold
          ? ':question: Why do you need these items?'
          : ':question: This order is pretty high, who approved it?\n:question: Why do you need it?',
    })

    const event = await stream.take()

    if (event.type === 'message') {
      order.reason = event.text
      const dbId = await storeOrder({user, ts, isCompany: true, reason: order.reason}, order.items)
      await notifyOfficeManager(order, dbId, user, true)
      await updateMessage({
        fields: [...attachment.fields, {title: 'Reason', value: event.text, short: false}],
        pretext: ':office: Company order finished:',
        color: 'good',
        actions: [],
      })
      await apiCall('chat.postMessage', {
        channel: user, as_user: true, text: ':office: Company order finished :point_up:',
      })
    }

    if (event.type === 'action') {
      await cancelOrder()
      await apiCall('chat.postMessage', {
        channel: user, as_user: true, text: ':no_entry_sign: Canceling :point_up:',
      })
    }

  }
}

async function notifyOfficeManager(order, dbId, user, isCompany) {
  const orderTypeText = isCompany ? ':office: Company' : ':woman: Personal'

  const orderAttachment = {
    ...orderToAttachment(order, `${orderTypeText} order from <@${user}>`),
    callback_id: `O${dbId}`,
    actions: [{name: 'add-to-cart', text: 'Add to Cart', type: 'button', value: dbId, style: 'primary'}],
  }

  await apiCall('chat.postMessage', {
    channel: c.officeManager, as_user: true,
    attachments: [orderAttachment],
  })
}

async function updateOrder(order, event, user) {
  if (order.orderConfirmation) {
    const {channel, ts} = order.orderConfirmation
    await apiCall('chat.delete', {channel, ts})
  }

  const [info, errors] = await orderInfo(parseOrder(event.text))

  for (const i of info.items) {
    if (order.items.get(i.id)) order.items.get(i.id).count += i.count
    else order.items.set(i.id, i)
  }
  order.totalPrice += info.totalPrice

  const orderAttachment = {
    ...orderToAttachment(order, 'Please confirm your order:'),
    ...makeOrderActions(order),
  }

  if (errors.length > 0) {
    await apiCall('chat.postMessage', {
      channel: user,
      as_user: true,
      text: `:exclamation: I can't find these items:\n${errors.join('\n')}`,
    })
  }

  const orderConfirmation = await apiCall('chat.postMessage', {
    channel: user,
    attachments: [orderAttachment],
    as_user: true,
  })

  return {...order, orderConfirmation}
}

function itemsField(order) {
  const itemLines = [...order.items.values()].map((item) => {
    const itemPrice = formatter.format(item.price).padStart(10)
    return `\`${itemPrice}\` <${item.url}|${item.count} x ${item.name}>`
  })

  return {title: 'Items', value: itemLines.join('\n'), short: false}
}

function makeOrderActions(order) {
  return {
    callback_id: order.id,
    actions: [
      {name: 'personal', text: 'Make Personal Order', type: 'button', value: 'personal'},
      {name: 'company', text: 'Make Company Order', type: 'button', value: 'company'},
      {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'},
    ],
  }
}

function orderToAttachment(order, text) {
  return {
    title: 'Order summary',
    pretext: text,
    fields: [
      itemsField(order),
      {title: 'Total value', value: formatter.format(order.totalPrice)},
      order.reason && {title: 'Reason', value: order.reason},
    ],
    mrkdwn_in: ['fields'],
  }
}

function parseOrder(text) {
  const re = /\s*(\d*)\s*<(http[^\s]+)>/g
  let matches
  const goods = []
  while ((matches = re.exec(text)) !== null) {
    if (matches[1] === '') matches[1] = '1'
    goods.push({url: matches[2], count: parseInt(matches[1], 10)})
  }
  return goods
}

async function orderInfo(items) {
  const info = []
  const errors = []
  let totalPrice = 0
  await login(c.alza.credentials)
  for (const item of items) {
    await (async function() {
      const itemInfo = await getInfo(item.url)
      info.push({...itemInfo, count: item.count, url: item.url})
      totalPrice += itemInfo.price * item.count
    })().catch((e) => {
      errors.push(item.url)
    })
  }
  return [{items: info, totalPrice}, errors]
}

async function storeOrder(order, items) {
  const id = await knex.transaction((trx) => (async function() {
    const id = (await trx.insert(order, 'id').into('order'))[0]

    for (const item of items.values()) {
      await trx.insert({
        order: id,
        shopId: item.id,
        count: item.count,
        url: item.url,
        price: item.price,
      }).into('orderItem')
    }
    return id
  })())

  const user = (await apiCall('users.info', {user: order.user})).user

  const airtableOrder = await createRecord('Orders', {
    id,
    'User': user.profile.real_name,
    'Company Order': order.isCompany,
    'Reason': order.reason,
    'Status': 'Requested',
  })

  for (const item of items.values()) {
    await createRecord('Items', {
      Name: item.name,
      Url: item.url,
      Count: item.count,
      Price: item.price,
      Order: [airtableOrder.getId()],
    })
  }

  return id
}
