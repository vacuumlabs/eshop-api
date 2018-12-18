import c from './config'
import _knex from 'knex'
import _request from 'request-promise'
import {createChannel} from 'yacol'
import {getInfo, addToCartAll} from './alza'
import {format} from './currency'
import {create as createRecord, updateByFilter as updateRecord} from './airtable'
import WS from 'ws'
import logger from 'winston'

const API = 'https://slack.com/api/'
const OFFICES = ['Bratislava', 'Košice', 'Praha', 'Brno']

const CANCEL_ORDER_ACTION = {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'}

const ORDER_TYPE_ACTIONS = [
  {name: 'personal', text: 'Make Personal Order', type: 'button', value: 'personal'},
  {name: 'company', text: 'Make Company Order', type: 'button', value: 'company'},
  CANCEL_ORDER_ACTION,
]

const ORDER_OFFICE_ACTIONS = [
  ...OFFICES.map((office) => ({
    name: 'office',
    text: office,
    type: 'button',
    value: office,
  })),
  CANCEL_ORDER_ACTION,
]

const request = _request.defaults({})
const knex = _knex(c.knex)

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

// eslint-disable-next-line require-await
export async function init(token, stream) {
  state = {
    token,
    streams: {},
    pendingActions: {},
    actionsCount: 0,
  }

  listen(stream)
  maintainConnection(token, stream)
}

async function maintainConnection(token, stream) {
  for (;;) {
    const connection = await connect(token, stream)
    while (await isAlive(connection)) {/* empty */}
    connection.terminate()
    logger.log('info', 'Connection dropped, reconnecting.')
  }
}

async function isAlive(connection) {
  let alive = false
  connection.ping('')
  connection.once('pong', () => (alive = true))
  await new Promise((resolve) => setTimeout(resolve, 10000))
  return alive
}

async function connect(token, stream) {
  const response = await apiCall('rtm.connect')

  state = {
    ...state,
    team: response.team,
    bot: response.self,
  }

  const connection = new WS(response.url)
  connection.on('message', (data) => stream.put(JSON.parse(data)))
  await new Promise((resolve) => connection.once('open', resolve))

  logger.log('info', 'WS connection to Slack established', {...state, token: '[SECRET]'})

  return connection
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

async function listen(stream) {
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
    office: null,
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
        const finished = await finishOrder(
          stream,
          order,
          event.actions[0].name,
          event.actions[0].value,
          user,
        )

        if (finished) {
          break
        }
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
  const actionName = event.actions[0].name
  const orderId = event.actions[0].value
  const msg = event.original_message
  const attachment = msg.attachments[0]

  if (actionName === 'notify-user') {
    const userId = attachment.pretext.match(/<@(.+)>/)[1]

    if (!userId) {
      logger.log('error', `Failed to parse user ID from '${attachment.pretext}`)
      await addReaction('no_bell', event.channel.id, msg.ts)
      return
    }

    const notifyOk = await notifyUser(userId, {attachments: [orderToAttachment('Your order has arrived :truck: Come pick it up during office hours', attachment.fields.slice(0, 3))]})

    if (!notifyOk) {
      await addReaction('no_bell', event.channel.id, msg.ts)
      return
    }

    await addReaction('incoming_envelope', event.channel.id, msg.ts)

    await updateRecord('Orders', `id = ${orderId}`, {Status: 'DELIVERED'})
      .catch((err) => {
        logger.log('error', 'Failed tu update airtable', err)
        addReaction('x', event.channel.id, msg.ts)
      })
      .then(() => addReaction('inbox_tray', event.channel.id, msg.ts))
  } else {
    const [addToCartAction, ...otherActions] = attachment.actions

    await apiCall('chat.update', {channel: event.channel.id, ts: msg.ts, attachments: [{
      ...attachment,
      actions: [{...addToCartAction, text: 'Add to Cart Again', style: 'default'}, ...otherActions],
    }]})

    const items = await knex.select('shopId', 'count', 'url').from('orderItem').where('order', orderId)

    await addToCartAll(items)
  }
}

async function finishOrder(stream, order, action, actionValue, user) {
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

  if (action === 'office') {
    order.office = actionValue
    await updateMessage({
      actions: ORDER_TYPE_ACTIONS,
      fields: getOrderFields(order),
    })

    return false
  }

  if (action === 'cancel') {
    await cancelOrder()
    return true
  }

  if (action === 'personal') {
    const dbId = await storeOrder({user, ts, isCompany: false, office: order.office}, order.items)
    await notifyOfficeManager(order, dbId, user, false)
    await updateMessage({
      pretext: ':woman: Personal order finished:',
      color: 'good',
      actions: [],
      fields: getOrderFields(order),
    })
    return true
  }

  if (action === 'company') {
    await updateMessage({
      actions: [CANCEL_ORDER_ACTION],
      fields: getOrderFields(order),
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
      const dbId = await storeOrder(
        {
          user,
          ts,
          isCompany: true,
          reason: order.reason,
          office: order.office,
        },
        order.items,
      )
      await notifyOfficeManager(order, dbId, user, true)
      await updateMessage({
        fields: [getOrderFields(order), {title: 'Reason', value: event.text, short: false}],
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

    return true
  }

  return false
}

async function notifyOfficeManager(order, dbId, user, isCompany) {
  const orderTypeText = isCompany ? ':office: Company' : ':woman: Personal'

  const orderAttachment = orderToAttachment(`${orderTypeText} order from <@${user}>`, getOrderFields(order))

  await apiCall('chat.postMessage', {
    channel: c.officeManager, as_user: true,
    attachments: [{
      ...orderAttachment,
      callback_id: `O${dbId}`,
      actions: [
        {name: 'add-to-cart', text: 'Add to Cart', type: 'button', value: dbId, style: 'primary'},
        {name: 'notify-user', text: 'Notify user', type: 'button', value: dbId, style: 'default'},
      ],
    }],
  })
  await apiCall('chat.postMessage', {
    channel: c.ordersChannel,
    attachments: [orderAttachment],
  })
}

async function notifyUser(userId, message) {
  const {channel: {id: channelId}, error: channelError} = await apiCall('conversations.open', {users: userId})

  if (!channelId) {
    logger.log('error', `Failed to open conversation with user '${userId}': ${channelError}`)
    return false
  }

  const {error: notifyError} = await apiCall('chat.postMessage', {
    ...message,
    channel: channelId,
    as_user: true,
  })

  if (notifyError) {
    logger.log('error', `Failed to notify user '${userId}': ${notifyError}`)
    return false
  }

  return true
}

async function addReaction(name, channel, timestamp) {
  const {ok, error} = await apiCall('reactions.add', {name, channel, timestamp})

  if (ok === false && error !== 'already_reacted') {
    logger.log('error', `Failed to add reaction '${name}'`)
    return false
  }

  return true
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
    ...orderToAttachment(
      'Please confirm your order:',
      [
        ...getOrderFields(order),
        !order.office && {title: 'Where do you want to pickup the order?'},
      ].filter(Boolean),
    ),
    callback_id: order.id,
    actions: order.office ? ORDER_TYPE_ACTIONS : ORDER_OFFICE_ACTIONS,
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

function itemsField(items) {
  const itemLines = [...items.values()].map((item) => {
    const itemPrice = format(item.price, c.currency).padStart(10)
    const itemPriceOrig = item.currency === c.currency ? '' : format(item.priceOrig, item.currency)
    return `\`${itemPrice}\` ${itemPriceOrig ? ` (${itemPriceOrig})` : ''} <${item.url}|${item.count} x ${item.name}>`
  })

  return {title: 'Items', value: itemLines.join('\n'), short: false}
}

function getOrderFields(order) {
  return [
    itemsField(order.items),
    {title: 'Total value', value: format(order.totalPrice, c.currency)},
    order.office && {title: 'Office', value: order.office},
    order.reason && {title: 'Reason', value: order.reason},
  ]
}

function orderToAttachment(text, fields) {
  return {
    title: 'Order summary',
    pretext: text,
    fields,
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
  for (const item of items) {
    // eslint-disable-next-line no-loop-func
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
    'Office': order.office,
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
