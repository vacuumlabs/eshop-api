import c from './config'
import _knex from 'knex'
import {createChannel} from 'yacol'
import moment from 'moment-timezone'
import {makeApiCall} from './slackApi'
import {getInfo, addToCartAll, getLangByLink} from './alza'
import {format} from './currency'
import WS from 'ws'
import logger, {logError, logOrder} from './logger'
import {storeOrder as storeOrderToSheets} from './sheets/storeOrder'
import {addSubsidy as addSubsidyToSheets} from './sheets/addSubsidy'
import {updateStatus as updateStatusInSheets} from './sheets/updateStatus'
import {NEW_ORDER_STATUS} from './sheets/constants'
import {MESSAGES} from './slack/constants'

const OFFICES = {
  sk: {
    name: 'Slovakia',
    options: ['Bratislava', 'Košice', 'Prešov'],
    currency: 'EUR',
  },
  cz: {
    name: 'Czech republic',
    options: ['Praha', 'Brno'],
    currency: 'CZK',
  },
  hu: {
    name: 'Hungary',
    options: ['Budapest'],
    currency: 'HUF',
  },
}

const HOME_VALUE = 'Remote'

const HOME_TO_OFFICE = {
  sk: 'Bratislava',
  cz: 'Brno',
  hu: 'Budapest',
}

const OFFICE_CHANNELS = {
  Bratislava: c.ordersChannelSkBa,
  Košice: c.ordersChannelSkKe,
  Prešov: c.ordersChannelSkPr,
  Praha: c.ordersChannelCzPr,
  Brno: c.ordersChannelCzBr,
  Budapest: c.ordersChannelHuBu,
}

const CANCEL_ORDER_ACTION = {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'}

const ORDER_TYPE_ACTIONS = [
  {name: 'personal', text: 'Make Personal Order', type: 'button', value: 'personal'},
  {name: 'company', text: 'Make Company Order', type: 'button', value: 'company'},
  CANCEL_ORDER_ACTION,
]

const ORDER_COUNTRY_ACTIONS = [
  ...Object.keys(OFFICES).map((country) => ({
    name: 'country',
    text: OFFICES[country].name,
    type: 'button',
    value: country,
  })),
  CANCEL_ORDER_ACTION,
]

const ORDER_OFFICE_ACTIONS = Object.keys(OFFICES).reduce((acc, country) => {
  acc[country] = [
    ...OFFICES[country].options.map((office) => ({
      name: 'office',
      text: office,
      type: 'button',
      value: office,
    })),
    {
      name: 'office',
      text: 'Home',
      type: 'button',
      value: HOME_VALUE,
    },
    CANCEL_ORDER_ACTION,
  ]

  return acc
}, {})

const ORDER_URGENT_ACTIONS = [
  {name: 'urgent', text: 'It\'s urgent, I will pay for delivery', type: 'button', value: 'urgent-yes'},
  {name: 'urgent', text: 'It\'s not urgent, I can wait', type: 'button', value: 'urgent-no'},
  CANCEL_ORDER_ACTION,
]

const NOTE_NO_ACTION = {name: 'note', text: 'Continue without note', type: 'button', value: 'note-no'}

const ORDER_NOTE_ACTIONS = [
  {name: 'note', text: 'Add note', type: 'button', value: 'note-yes'},
  NOTE_NO_ACTION,
  CANCEL_ORDER_ACTION,
]

const knex = _knex(c.knex)

let state = {}

export async function apiCall(name, data = {}, {
  passError = false,
  asAdmin = false,
} = {}) {
  logger.log('verbose', `call slack.api.${name}`, data)
  const response = JSON.parse(
    await makeApiCall(name, data, asAdmin ? c.slack.adminToken : c.slack.botToken),
  )
  logger.log('verbose', `response slack.api.${name}`, {args: data, response})

  if (!passError && response.error) {
    throw new Error(`slack.api.${name}: ${response.error}`)
  }

  return response
}

// eslint-disable-next-line require-await
export async function init(token, stream) {
  const {user_id: botUserId} = await apiCall('auth.test')

  state = {
    botUserId,
    token,
    streams: {},
    pendingActions: {},
    actionsCount: 0,
  }

  // const channels = [
  //   c.ordersChannel,
  //   c.ordersChannelSkBa,
  //   c.ordersChannelSkKe,
  //   c.ordersChannelSkPr,
  //   c.ordersChannelCzPr,
  //   c.ordersChannelCzBr,
  //   c.ordersChannelHuBu,
  // ]

  // let index = 0

  // for (const channel of channels) {
  //   let latest

  //   // eslint-disable-next-line no-constant-condition
  //   while (true) {
  //     const {messages, has_more: hasMore} = await apiCall('conversations.history', {channel, latest}, {asAdmin: true})

  //     for (const {user, attachments, ts} of messages) {
  //       latest = ts

  //       if (!attachments || user !== botUserId) continue

  //       const archiveAtt = attachments.find((att) => att.text === 'Archive')

  //       if (archiveAtt) continue

  //       const actionsAtt = attachments.find((att) => att.actions)

  //       const orderId = actionsAtt && actionsAtt.callback_id.substring(1)

  //       await apiCall('chat.update', {channel, ts, attachments: [
  //         ...attachments,
  //         {
  //           text: 'Archive',
  //           actions: [
  //             {
  //               type: 'button',
  //               name: 'archive',
  //               text: orderId ? 'Archive' : 'Archive permanently',
  //               value: orderId || '-',
  //               style: 'default',
  //             },
  //           ],
  //           callback_id: `O${orderId || '-'}`,
  //         },
  //       ]})

  //       index++

  //       if (index % 50 === 0) {
  //         await new Promise((resolve) => setTimeout(resolve, 60))
  //       }
  //     }

  //     if (!hasMore || !messages || messages.length === 0) break
  //   }
  // }

  // console.log('Upgrade complete')

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
  // ignore messages from the bot
  if (event.user === state.bot.id) return false
  // user is writing the bot (D-irect message)
  if (event.channel[0] === 'D') return true
  // the bot is mentioned
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
I will get you any computer or phone equipment from Alza. Use me for both your personal and company orders.

DM me with Alza links and I'll order them. Like this:
> https://www.alza.sk/cool-smartphone https://www.alza.sk/cool-chopter https://www.alza.sk/cool-cooler

Do you want to order 3 Cool Coolers and 2 Cool Smartphones? Just tell me so:
> 3 https://www.alza.cz/cool-cooler 2 https://www.alza.cz/cool-smartphone

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
      // TODO: require confirmation before sending a company-wide message
      await announceToAll(event.text)
      continue
    }

    if (event.type === 'team_join') {
      await greetNewUser(event.user.id)
      continue
    }

    if (event.type === 'action') {
      if (event.callback_id.startsWith('O')) {
        await handleOrderAction(event).catch((e) => {
          logError(e, 'Admin action error', event.user.id, {
            action: event.actions[0].name,
            value: event.actions[0].value,
            orderId: event.callback_id.substring(1),
          })
          showError(event.channel.id, null, 'Something went wrong.')
        })

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

function showError(channel, ts, msg) {
  return apiCall(ts ? 'chat.update' : 'chat.postMessage', {
    channel, ts, as_user: true, text: `:exclamation: ${msg}`, attachments: [],
  })
}

async function listenUser(stream, user) {
  const newOrder = () => ({
    id: null,
    items: new Map(),
    totalPrice: 0,
    country: null,
    office: null,
    orderConfirmation: null,
    isCompany: null,
    isUrgent: null,
    isHome: false,
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
          event.user,
        ).catch((err) => {
          logError(err, 'User action error', event.user.id, {
            action: event.actions[0].name,
            value: event.actions[0].value,
            order: logOrder(order),
          })
          showError(order.orderConfirmation.channel, event.original_message.ts, 'Something went wrong, please try again.')

          return true
        })

        if (finished) {
          break
        }
      }

      if (event.type === 'message') {
        order = setId(order, nextUUID())
        order = await updateOrder(order, event, user).catch(async (err) => {
          await logError(err, 'User order error', user.id, {
            msg: event.text,
            order: logOrder(order),
          })
          await showError(user, event.original_message.ts, 'Something went wrong, please try again.')

          return order
        })
      }
    }

    destroyOrder(order)
  }
}

export async function getOrderAndItemsFromDb(orderId) {
  return await knex.transaction(async (trx) => {
    const order = (
      await trx
        .select('id', 'isCompany', 'user', 'office', 'isUrgent', 'isHome')
        .from('order')
        .where('id', orderId)
    )[0]

    const items = await trx
      .select('id', 'price', 'shopId', 'count', 'url')
      .from('orderItem')
      .where('order', orderId)

    return {order, items}
  })
}

function createOrderFromDb(orderData, itemsData) {
  const country = Object.keys(OFFICES).find((off) => OFFICES[off] && OFFICES[off].options.includes(orderData.office)) || 'sk'

  const items = new Map()

  itemsData.forEach((item) => {
    if (!items.has(item.url)) {
      items.set(item.url, {
        id: item.url,
        name: item.url,
        description: '',
        price: item.price,
        currency: OFFICES[country].currency,
        withoutLogin: true,
        count: 1,
        url: item.url,
      })
    } else {
      items.get(item.url).count += 1
    }
  })

  return {
    id: orderData.id,
    items,
    totalPrice: itemsData.reduce((acc, item) => acc + item.price, 0),
    country,
    office: orderData.office,
    orderConfirmation: null,
  }
}

function getArchiveActions(orderId, toArchive) {
  return [
    {
      text: 'Archive',
      actions: [
        {
          type: 'button',
          name: toArchive ? 'unarchive' : 'archive',
          text: toArchive ? 'Unarchive' : 'Archive',
          value: orderId,
          style: 'default',
        },
      ],
      callback_id: `O${orderId}`,
    },
  ]
}

function getAdminActions(orderId, primaryBtn, msgButtons) {
  const buttons = (msgButtons || [
    {name: 'add-to-cart', text: 'Add to Cart'},
    {name: 'ordered', text: 'Notification - ordered'},
    {name: 'delivered', text: 'Notification - delivered'},
    {name: 'subsidy', text: 'Mark as Subsidy'},
  ]).map((btn) => ({
    ...btn,
    type: 'button',
    value: orderId,
    style: primaryBtn === btn.name ? 'primary' : 'default',
  }))

  return [
    {
      text: 'Status',
      actions: [{
        type: 'select',
        name: 'status',
        text: 'Set status...',
        options: ['requested', 'ordered', 'canceled', 'delivered', 'lost', 'sold', 'used', 'gift'].map((status) => ({
          text: status,
          value: status,
        })),
      }],
      callback_id: `O${orderId}`,
    },
    {
      text: '*Actions*',
      actions: buttons,
      callback_id: `O${orderId}`,
    },
    ...getArchiveActions(orderId, false),
  ]
}

async function changeStatus({
  order,
  items,
  status,
  channelId,
  msgTs,
  textAttachments,
  actionsAttachments,
  statusIcon,
}) {
  if (statusIcon) {
    await removeReaction(statusIcon, channelId, msgTs)
  }

  await removeReaction('x', channelId, msgTs)

  await updateStatusInSheets(order, items, status)
    .then(() => apiCall('chat.update', {
      channel: channelId,
      ts: msgTs,
      attachments: [
        ...textAttachments.map((att) => att.text && att.text.startsWith('*Status*') ? {...att, text: `*Status*\n${status}`} : att),
        ...actionsAttachments,
      ],
    }))
    .catch((err) => {
      logger.log('error', 'Failed to update sheet', err)
      addReaction('x', channelId, msgTs)
    })

  if (statusIcon) {
    await addReaction(statusIcon, channelId, msgTs)
  }
}

async function getComments(ts, channel) {
  async function fetchComments(cursor) {
    const {messages, response_metadata: {next_cursor: nextCursor} = {}} = await apiCall('conversations.replies', {channel, ts, cursor}, {asAdmin: true})

    return nextCursor ? [...messages, ...await fetchComments(nextCursor)] : messages
  }

  const [mainMsg, ...comments] = await fetchComments()

  return {mainMsg, comments}
}

async function getUsers(cursor) {
  const {members, response_metadata: {next_cursor: nextCursor} = {}} = await apiCall('users.list', {cursor})

  const membersMap = members.reduce((acc, {id, name}) => {
    acc[id] = name
    return acc
  }, {})

  return nextCursor ? {...membersMap, ...getUsers(nextCursor)} : membersMap
}

function msgTsToDate(ts) {
  const [seconds] = ts.split('.')

  return new Date(parseInt(seconds, 10) * 1000)
}

function getTS(date = new Date()) {
  return moment(date).tz('Europe/Bratislava').format('YYYY-MM-DD HH:mm')
}

async function moveOrder(ts, fromChannel, toChannel, data) {
  const {message: {ts: newTs}} = await apiCall('chat.postMessage', {
    channel: toChannel,
    as_user: true,
    ...data,
  })

  const [{mainMsg, comments}, usersMap] = await Promise.all([
    getComments(ts, fromChannel),
    getUsers(),
  ])

  if (mainMsg.reactions) {
    for (const {name: reaction} of mainMsg.reactions) {
      await addReaction(reaction, toChannel, newTs)
    }
  }

  for (const {user, text, ts: commentTs, reactions = [], files} of comments) {
    const mainText = !user || user === state.botUserId ? (text || ' ') : `<@${user}> ${getTS(msgTsToDate(commentTs))}:\n\n${text}`
    const filesText = files && files.map((file) => `${file.title}: ${file.permalink}`).join('\n')

    const fullText = `${mainText}${filesText ? `\n\n${filesText}` : ''}`

    const finalText = fullText.replace(
      /<@([A-Z0-9]+)>/g,
      (match, userId) =>
        usersMap[userId]
          ? `<https://vacuumlabs.slack.com/team/${userId}|${usersMap[userId]}>`
          : `<@${userId}>`,
    )

    const {message: {ts: newCommentTs}} = await apiCall('chat.postMessage', {
      channel: toChannel,
      thread_ts: newTs,
      text: finalText,
    })

    for (const {name: reaction} of reactions) {
      await addReaction(reaction, toChannel, newCommentTs)
    }

    await apiCall('chat.delete', {channel: fromChannel, ts: commentTs}, {asAdmin: true})
  }

  await apiCall('chat.delete', {channel: fromChannel, ts}, {asAdmin: true})
}

async function handleOrderAction(event) {
  const actionName = event.actions[0].name
  const orderId = event.callback_id.substring(1)
  const msg = event.original_message
  const attachments = msg.attachments.length === 1
    ? {...msg.attachments, actions: []} // legacy format
    : msg.attachments.filter((att) => !att.actions)
  const buttonsAtt = msg.attachments.find((att) => att.actions && att.actions[0].type === 'button' && att.text !== 'Archive')
  const msgButtons = buttonsAtt && buttonsAtt.actions

  if (orderId === '-' && actionName !== 'archive') {
    throw new Error(`Invalid order ID for action ${actionName}`)
  }

  const {order, items} = orderId === '-' ? {} : await getOrderAndItemsFromDb(orderId)

  if (actionName === 'forward-to-channel') { // Forward to office channel
    await moveOrder(msg.ts, event.channel.id, OFFICE_CHANNELS[order.office], {
      attachments: [
        ...attachments,
        ...getAdminActions(orderId, 'add-to-cart'),
      ],
    })
  } else if (actionName === 'decline') { // Notify user - decline
    await removeReaction('no_entry_sign', event.channel.id, msg.ts)

    await sendUserInfo(event, 'There was an issue with your order. Somebody from backoffice will contact you about it soon.', createOrderFromDb(order, items))

    await addReaction('no_entry_sign', event.channel.id, msg.ts)
  } else if (actionName === 'discard') { // Discard order
    await removeReaction('x', event.channel.id, msg.ts)

    await updateStatusInSheets(order, items, 'discarded')
      .then(() => apiCall('chat.delete', {channel: event.channel.id, ts: msg.ts}))
      .catch((err) => {
        logger.log('error', 'Failed to update sheet', err)
        addReaction('x', event.channel.id, msg.ts)
      })
  } else if (actionName === 'archive') { // Move to archive
    await moveOrder(msg.ts, event.channel.id, c.archiveChannel, {
      attachments: [
        ...attachments,
        ...(orderId === '-' ? [] : getArchiveActions(orderId, true)),
      ],
    })
  } else if (actionName === 'unarchive') { // Move from archive
    await moveOrder(msg.ts, event.channel.id, OFFICE_CHANNELS[order.office], {
      attachments: [
        ...attachments,
        ...getAdminActions(orderId, 'add-to-cart'),
      ],
    })
  } else if (actionName === 'add-to-cart') { // Add items to cart
    await removeReaction('shopping_trolley', event.channel.id, msg.ts)

    await addToCartAll(items)

    await apiCall('chat.update', {
      channel: event.channel.id,
      ts: msg.ts,
      attachments: [
        ...attachments,
        ...getAdminActions(orderId, 'ordered', msgButtons),
      ],
    })

    await addReaction('shopping_trolley', event.channel.id, msg.ts)
  } else if (actionName === 'ordered') { // Notify user - ordered
    await sendUserInfo(event, 'Your items were ordered. You will be notified when they arrive.', createOrderFromDb(order, items))

    await changeStatus({
      order,
      items,
      status: 'ordered',
      channelId: event.channel.id,
      msgTs: msg.ts,
      textAttachments: attachments,
      actionsAttachments: getAdminActions(orderId, 'delivered', msgButtons),
      statusIcon: 'page_with_curl',
    })
  } else if (actionName === 'delivered') { // Notify user - delivered
    await sendUserInfo(event, 'Your order has arrived :truck: Come pick it up during office hours. If it was a personal order, please bring the money in CASH.', createOrderFromDb(order, items))

    await changeStatus({
      order,
      items,
      status: 'ordered',
      channelId: event.channel.id,
      msgTs: msg.ts,
      textAttachments: attachments,
      actionsAttachments: getAdminActions(orderId, 'subsidy', msgButtons),
      statusIcon: 'inbox_tray',
    })
  } else if (actionName === 'subsidy') { // Mark subsidy
    await removeReaction('money_with_wings', event.channel.id, msg.ts)

    await addSubsidyToSheets(order, items)

    await apiCall('chat.update', {
      channel: event.channel.id,
      ts: msg.ts,
      attachments: [
        ...attachments,
        ...getAdminActions(orderId, 'close', msgButtons.filter((btn) => btn.name !== 'subsidy')),
      ],
    })

    await addReaction('money_with_wings', event.channel.id, msg.ts)
  } else if (actionName === 'close') { // Close order
    await apiCall('chat.update', {
      channel: event.channel.id,
      ts: msg.ts,
      attachments: [
        ...attachments,
        ...getArchiveActions(orderId, false),
      ],
    })

    await addReaction('checkered_flag', event.channel.id, msg.ts)
  } else if (actionName === 'status') { // Set order status
    const status = event.actions[0].selected_options[0].value

    await changeStatus({
      order,
      items,
      status,
      channelId: event.channel.id,
      msgTs: msg.ts,
      textAttachments: attachments,
      actionsAttachments: msg.attachments.filter((att) => Boolean(att.actions)),
    })
  }
}

async function finishOrder(stream, order, action, actionValue, user) {
  const {channel, ts, message: {attachments: [attachment]}} = order.orderConfirmation
  async function updateMessage(attachmentUpdate) {
    await apiCall('chat.update', {channel, ts, as_user: true,
      attachments: [{...attachment, ...attachmentUpdate}],
    })
  }

  async function submitOrder(commentMsg, forceComment) {
    let completeNewMsg = false

    if (commentMsg) {
      completeNewMsg = true

      await updateMessage({
        actions: [forceComment ? null : NOTE_NO_ACTION, CANCEL_ORDER_ACTION].filter(Boolean),
        fields: getOrderFields(order),
      })

      await apiCall('chat.postMessage', {
        channel: user.id,
        as_user: true,
        text: commentMsg,
      })

      const event = await stream.take()

      if (event.type === 'message') {
        order.reason = event.text
        completeNewMsg = true
      } else if (event.type === 'action' && event.actions[0].name === 'cancel') {
        await cancelOrder()
        await apiCall('chat.postMessage', {
          channel: user.id,
          as_user: true,
          text: ':no_entry_sign: Canceling :point_up:',
        })
        return
      }
    }

    const dbId = await storeOrder(
      {
        user,
        ts,
        isCompany: order.isCompany,
        office: order.office,
        reason: order.reason,
        isUrgent: order.isUrgent,
      },
      order.items,
    )
    await notifyOfficeManager(order, dbId, user.id, order.isCompany)
    await updateMessage({
      pretext: order.isCompany ? ':office: Company order finished:' : ':woman: Personal order finished:',
      color: 'good',
      actions: [],
      fields: getOrderFields(order),
    })
    if (completeNewMsg) {
      await apiCall('chat.postMessage', {
        channel: user.id,
        as_user: true,
        text: order.isCompany ? ':office: Company order finished :point_up:' : ':woman: Personal order finished :point_up:',
      })
    }
  }

  async function cancelOrder() {
    await updateMessage({
      pretext: ':no_entry_sign: Order canceled:',
      color: 'danger',
      actions: [],
    })
  }

  if (action === 'cancel') {
    await cancelOrder()
    return true
  }

  if (action === 'country') {
    order.country = actionValue
    await updateMessage({
      actions: ORDER_OFFICE_ACTIONS[order.country],
      fields: [
        ...getOrderFields(order),
        {title: 'Where do you want to pickup the order?'},
      ],
    })

    return false
  }

  // office/home
  if (action === 'office') {
    order.isHome = actionValue === HOME_VALUE
    order.office = order.isHome ? HOME_TO_OFFICE[order.country] : actionValue
    await updateMessage({
      actions: ORDER_TYPE_ACTIONS,
      fields: getOrderFields(order),
    })

    return false
  }

  // ?-personal
  if (action === 'personal') {
    order.isCompany = false
    await updateMessage({
      actions: ORDER_URGENT_ACTIONS,
      fields: [...getOrderFields(order), {title: 'How urgent is your order?'}],
    })

    return false
  }

  // ?-personal-urgent
  if (action === 'urgent') {
    order.isUrgent = actionValue === 'urgent-yes'

    // home-personal-urgent
    if (order.isHome) {
      await submitOrder(MESSAGES.home.personal, true)
      return true
    }

    // office-personal-urgent
    await updateMessage({
      actions: ORDER_NOTE_ACTIONS,
      fields: [...getOrderFields(order), {title: ':pencil: Do you want to add a note to the order?'}],
    })
    return false
  }

  // office-personal-?-note
  if (action === 'note') {
    await submitOrder(actionValue === 'note-yes' ? MESSAGES.office.personal.note : null)
    return true
  }

  // ?-company
  if (action === 'company') {
    order.isCompany = true

    await submitOrder(order.isHome ? MESSAGES.home.company : MESSAGES.office.company, true)
    return true
  }

  return false
}

async function notifyOfficeManager(order, dbId, user, isCompany) {
  const orderTypeText = isCompany ? ':office: Company' : ':woman: Personal'

  const orderAttachment = orderToAttachment(`${orderTypeText} order from <@${user}>`, getOrderFields(order, true))

  await apiCall('chat.postMessage', {
    channel: c.ordersChannel,
    as_user: true,
    attachments: [
      orderAttachment,
      {
        text: `*Status*\n${NEW_ORDER_STATUS}`,
      },
      {
        text: '*Actions*',
        callback_id: `O${dbId}`,
        actions: [
          ...(OFFICE_CHANNELS[order.office] ? [{name: 'forward-to-channel', text: `Forward to ${order.office}`, type: 'button', value: dbId, style: 'primary'}] : []),
          {name: 'decline', text: 'Decline', type: 'button', value: dbId, style: 'default'},
          {name: 'discard', text: 'Discard', type: 'button', value: dbId, style: 'danger'},
        ],
      },
    ],
  })
}

async function sendUserInfo(event, text, order) {
  const msg = event.original_message
  const attachment = msg.attachments[0]

  const userId = attachment.pretext.match(/<@(.+)>/)[1]

  await Promise.all([
    removeReaction('no_bell', event.channel.id, msg.ts),
    removeReaction('incoming_envelope', event.channel.id, msg.ts),
  ])

  if (!userId) {
    logger.log('error', `Failed to parse user ID from '${attachment.pretext}`)
    await addReaction('no_bell', event.channel.id, msg.ts)
    return false
  }

  const notifyOk = await notifyUser(userId, {
    attachments: [orderToAttachment(text, getOrderFields(order))],
  })

  if (!notifyOk) {
    await addReaction('no_bell', event.channel.id, msg.ts)
    return false
  }

  await addReaction('incoming_envelope', event.channel.id, msg.ts)

  return true
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
  const {ok, error} = await apiCall('reactions.add', {name, channel, timestamp}, {passError: true})

  if (ok === false && error !== 'already_reacted') {
    logger.log('error', `Failed to add reaction '${name}'`)
    return false
  }

  return true
}

async function removeReaction(name, channel, timestamp) {
  const {ok, error} = await apiCall('reactions.remove', {name, channel, timestamp}, {passError: true})

  if (ok === false && error !== 'no_reaction') {
    logger.log('error', `Failed to remove reaction '${name}'`)
    return false
  }

  return true
}

function getOrderActions(order) {
  if (!order.country) {
    return ORDER_COUNTRY_ACTIONS
  }

  if (!order.office) {
    return ORDER_OFFICE_ACTIONS[order.country]
  }

  return ORDER_TYPE_ACTIONS
}

async function updateOrder(order, event, user) {
  if (order.orderConfirmation) {
    const {channel, ts} = order.orderConfirmation
    await apiCall('chat.delete', {channel, ts})
  }

  const [info, errors] = await orderInfo(parseOrder(event.text), order.country)

  for (const i of info.items) {
    if (order.items.get(i.id)) order.items.get(i.id).count += i.count
    else order.items.set(i.id, i)
  }

  order.totalPrice += info.totalPrice

  if (order.items.size > 0) {
    order.country = info.country
  }

  if (errors.length > 0) {
    errors.forEach((e) => {
      logger.error('Failed to fetch item info', e.url, e.err.message)
    })

    await apiCall('chat.postMessage', {
      channel: user,
      as_user: true,
      text: `:exclamation: I can't find these items:\n${errors.map((e) => `${e.url}${e.err.customMsg ? ` - ${e.err.customMsg}` : ''}`).join('\n')}`,
    })
  }

  const totalCount = Array.from(order.items.entries()).reduce((acc, entry) => acc + entry[1], 0)

  if (totalCount === 0) {
    return {...order, orderConfirmation: null}
  }

  const orderAttachment = {
    ...orderToAttachment(
      [
        info.wrongCountry && ':exclamation: You cannot combine items from different Alza stores. Please create separate orders.',
        'Please confirm your order:',
      ].filter(Boolean).join('\n'),
      [
        ...getOrderFields(order),
        !order.country && {title: 'In which country is your office?'},
        order.country && !order.office && {title: 'Where do you want to pickup the order?'},
      ].filter(Boolean),
    ),
    callback_id: order.id,
    actions: getOrderActions(order),
  }

  const orderConfirmation = await apiCall('chat.postMessage', {
    channel: user,
    attachments: [orderAttachment],
    as_user: true,
  })

  return {...order, orderConfirmation}
}

function formatPrice(price, currency) {
  return price && !isNaN(price) ? format(price, currency) : '???'
}

function itemsField(items, showPrice, order) {
  const itemLines = [...items.values()].map((item) => {
    const itemDescription = `<${item.url}|${item.count} x ${item.name}>`

    if (!showPrice) {
      return itemDescription
    }

    const itemPrice = formatPrice(item.price, c.currency).padStart(10)
    const itemPriceOrig = item.currency === c.currency ? '' : formatPrice(item.priceOrig, item.currency)

    return `\`${itemPrice}\` ${itemPriceOrig ? ` (${itemPriceOrig})` : ''} ${itemDescription}`
  })

  const value = itemLines.join('\n')

  if (value.length < 5) {
    logError(new Error('Empty items'), 'Empty items', '-', {
      order: logOrder(order),
      value,
      adminMsg: showPrice,
    })
  }

  return {title: 'Items', value: itemLines.join('\n'), short: false}
}

function getOrderFields(order, adminMsg = false) {
  return [
    itemsField(order.items, adminMsg, order),
    adminMsg && {title: 'Total value', value: formatPrice(order.totalPrice, c.currency)},
    order.office && {title: 'Office', value: `${order.office}${order.isHome ? ' (home delivery)' : ''}`},
    order.reason && {title: order.isCompany ? 'Reason' : 'Note', value: order.reason, short: false},
    order.isUrgent !== null && {title: 'Urgent', value: order.isUrgent ? 'Yes' : 'No'},
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

async function orderInfo(items, country) {
  const info = []
  const errors = []
  let totalPrice = 0
  let wrongCountry = false
  let orderCountry = country
  for (const item of items) {
    // eslint-disable-next-line no-loop-func
    await (async function() {
      if (item.url.length > 255) {
        const err = new Error('URL too long')
        err.customMsg = 'URL cannot be longer than 255 characters. Try to remove unnecessary parameters'
        throw err
      }

      const itemCountry = getLangByLink(item.url)

      if (itemCountry && !orderCountry) {
        orderCountry = itemCountry
      }

      if (!itemCountry) {
        info.push({
          id: item.url,
          name: item.url,
          description: '',
          price: 0,
          currency: 'EUR',
          withoutLogin: true,
          count: item.count,
          url: item.url,
        })
      } else if (orderCountry !== itemCountry) {
        wrongCountry = true
      } else {
        const itemInfo = await getInfo(item.url)
        info.push({...itemInfo, count: item.count, url: item.url})

        if (itemInfo.price && !isNaN(itemInfo.price)) {
          totalPrice += itemInfo.price * item.count
        }
      }
    })().catch((e) => {
      logger.error('Failed to fetch item info', {url: item.url, err: e.message})

      info.push({
        id: item.url,
        name: item.url,
        description: '',
        price: 0,
        currency: 'EUR',
        withoutLogin: true,
        count: item.count,
        url: item.url,
      })

      // errors.push({
      //  url: item.url,
      //  err: e,
      // })
    })
  }
  return [{items: info, totalPrice, country: orderCountry, wrongCountry}, errors]
}

async function storeOrder(order, items) {
  const id = await knex.transaction(async (trx) => {
    order.id = (
      await trx.insert({...order, user: order.user.id}, 'id').into('order')
    )[0]

    for (const item of items.values()) {
      item.dbIds = []

      for (let i = 0; i < item.count; i++) {
        const itemId = (await trx.insert({
          order: order.id,
          shopId: item.id,
          count: 1,
          url: item.url,
          price: item.price,
        }, 'id').into('orderItem'))[0]

        item.dbIds.push(itemId)
      }
    }

    return order.id
  })

  await storeOrderToSheets(order, Array.from(items.values()))

  return id
}
