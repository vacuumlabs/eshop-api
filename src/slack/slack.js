import c from '../config'
import _knex from 'knex'
import {createChannel} from 'yacol'
import moment from 'moment-timezone'
import {makeApiCall} from './slackApi'
import {getInfo, addToCartAll, getLangByLink} from '../alza'
import {format} from '../currency'
import WS from 'ws'
import logger, {logError, logOrder} from '../logger'
import {storeOrder as storeOrderToSheets} from '../sheets/storeOrder'
import {addSubsidy as addSubsidyToSheets} from '../sheets/addSubsidy'
import {updateStatus as updateStatusInSheets} from '../sheets/updateStatus'
import {CANCEL_ORDER_ACTION, CITIES_OPTIONS_TO_CITIES, HOME_TO_OFFICE, HOME_VALUE, MESSAGES, NEW_USER_GREETING, NOTE_NO_ACTION, OFFICES, ORDER_NOTE_ACTIONS, ORDER_OFFICE_ACTIONS, ORDER_TYPE_ACTIONS, ORDER_URGENT_ACTIONS, SLACK_URL} from './constants'
import {getAdminSections, getArchiveSection, getNewOrderAdminSections, getUserActions} from './actions'

const knex = _knex(c.knex)

export class Slack {
  constructor(variant) {
    this.variant = variant
    this.config = c[variant]
    this.streams = {}
    this.pendingActions = {}
    this.actionsCount = 0
  }

  // this function shouldn't be called for wincent
  getCityChannel(officeOption) {
    const city = CITIES_OPTIONS_TO_CITIES[this.variant][officeOption]
    return this.config.channels.cities[city]
  }

  async apiCall(name, data = {}, {
    passError = false,
    asAdmin = false,
  } = {}) {
    logger.info(`[${this.variant}] calling slack.api.${name}. asAdmin: ${asAdmin} | data: ${JSON.stringify(data)}`)
    const response = await makeApiCall(name, data, asAdmin ? this.config.slack.adminToken : this.config.slack.botToken)
    const parsedResponse = JSON.parse(response)

    // logger.log('verbose', `response slack.api.${name}`, {args: data, parsedResponse})
    // const {message, ...optimizedResponse} = parsedResponse
    // console.log('response from:', name, optimizedResponse)

    if (!passError && parsedResponse.error) {
      // console.error('ERROR from:', name, parsedResponse.error)
      throw new Error(`slack.api.${name}: ${parsedResponse.error}`)
    }

    return parsedResponse
  }

  async init(stream) {
    const {user_id: botUserId} = await this.apiCall('auth.test')
    this.botUserId = botUserId

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

    this.listen(stream)
    this.maintainConnection(stream)
  }


  async maintainConnection(stream) {
    for (;;) {
      const connection = await this.connect(stream)
      while (await this.isAlive(connection)) {/* empty */}
      connection.terminate()
      logger.info('Connection dropped, reconnecting.')
    }
  }

  async isAlive(connection) {
    let alive = false
    connection.ping('')
    connection.once('pong', () => (alive = true))
    await new Promise((resolve) => setTimeout(resolve, 10000))
    return alive
  }

  async connect(stream) {
    const response = await this.apiCall('rtm.connect')

    this.team = response.team
    this.bot = response.self

    const connection = new WS(response.url)
    connection.on('message', (data) => stream.put(JSON.parse(data)))
    await new Promise((resolve) => connection.once('open', resolve))

    logger.info('WS connection to Slack established', {variant: this.variant, team: this.team, bot: this.bot})

    return connection
  }

  nextUUID() {
    return (`${Date.now()}#${this.actionsCount++}`)
  }

  amIMentioned(event) {
  // ignore messages from the bot
    if (event.user === this.bot.id) return false
    // user is writing the bot (D-irect message)
    if (event.channel[0] === 'D') return true
    // the bot is mentioned
    if (event.text.match(`<@${this.bot.id}>`)) return true
    return false
  }

  isMessage(event) {
    return event.type === 'message' && event.subtype == null
  }

  streamForUser(userId) {
    if (this.streams[userId] == null) {
      this.streams[userId] = createChannel()
      this.listenUser(this.streams[userId], userId)
    }
    return this.streams[userId]
  }

  async announceToAll(message) {
    const users =
    (await this.apiCall('users.list'))
      .members
      .filter((u) => u.is_bot === false)

    for (const u of users) {
      if (message === 'help') await this.greetNewUser(u.id)
      else await this.apiCall('chat.postMessage', {channel: u.id, as_user: true, text: message})
    }
  }

  async greetNewUser(userId) {
    await this.apiCall('chat.postMessage', {channel: userId, as_user: true, text: NEW_USER_GREETING[this.variant]})

  }

  async listen(stream) {
    for (;;) {
      const event = await stream.take()
      // logger.verbose(`slack event ${event.type}: ${JSON.stringify(event)}`)
      // console.log('event', event.type, event)

      if (this.isMessage(event) && this.amIMentioned(event)) {
        this.streamForUser(event.user).put(event)
        continue
      }

      if (this.isMessage(event) && event.channel === this.config.channels.news) {
      // TODO: require confirmation before sending a company-wide message
        await this.announceToAll(event.text)
        continue
      }

      if (event.type === 'team_join') {
        await this.greetNewUser(event.user.id)
        continue
      }

      if (event.type === 'action') {
        if (event.callback_id.startsWith('O')) {
          await this.handleOrderAction(event).catch((e) => {
            logError(this.variant, e, 'Admin action error', event.user.id, {
              action: event.actions[0].name,
              value: event.actions[0].value,
              orderId: event.callback_id.substring(1),
            })
            this.showError(event.channel.id, null, 'Something went wrong.')
          })

          continue
        }

        const actionStream = this.pendingActions[event.callback_id]
        if (actionStream) {actionStream.put(event)} else {
          await this.showError(event.channel.id, event.original_message.ts,
            'The order has timed out. Create a new order please.')
        }
      }
    }
  }

  showError(channel, ts, msg) {
    return this.apiCall(ts ? 'chat.update' : 'chat.postMessage', {
      channel, ts, as_user: true, text: `:exclamation: ${msg}`, attachments: [],
    })
  }

  async listenUser(stream, user) {
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

    const setId = (order, newId) => {
      if (order.id) delete this.pendingActions[order.id]
      if (newId) this.pendingActions[newId] = stream
      return {...order, id: newId}
    }

    const destroyOrder = (order) => {
      setId(order, null)
    }

    for (;;) {
      let order = newOrder()

      for (;;) {
        const event = await stream.take()

        if (event.type === 'action') {
          const finished = await this.handleUserAction(
            stream,
            order,
            event.actions[0].name,
            event.actions[0].value,
            event.user,
          ).catch((err) => {
            logError(this.variant, err, 'User action error', event.user.id, {
              action: event.actions[0].name,
              value: event.actions[0].value,
              order: logOrder(order),
            })
            this.showError(order.orderConfirmation.channel, event.original_message.ts, 'Something went wrong, please try again.')

            return true
          })

          if (finished) {
            break
          }
        }

        if (event.type === 'message') {
          order = setId(order, this.nextUUID())
          order = await this.updateOrder(order, event, user).catch(async (err) => {
            await logError(this.variant, err, 'User order error', user.id, {
              msg: event.text,
              order: logOrder(order),
            })
            await this.showError(user, event.original_message.ts, 'Something went wrong, please try again.')

            return order
          })
        }

        // console.log(';;', event && event.type)
      }

      destroyOrder(order)
    }
  }

  async changeStatus({
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
      await this.removeReaction(statusIcon, channelId, msgTs)
    }

    await this.removeReaction('x', channelId, msgTs)

    await updateStatusInSheets(this.variant, this.config.google.spreadsheetId, order, items, status)
      .then(() => this.apiCall('chat.update', {
        channel: channelId,
        ts: msgTs,
        attachments: [
          ...textAttachments.map((att) => att.text && att.text.startsWith('*Status*') ? {...att, text: `*Status*\n${status}`} : att),
          ...actionsAttachments,
        ],
      }))
      .catch((err) => {
        logger.error('Failed to update sheet', err)
        this.addReaction('x', channelId, msgTs)
      })

    if (statusIcon) {
      await this.addReaction(statusIcon, channelId, msgTs)
    }
  }

  async getComments(ts, channel) {
    const fetchComments = async (cursor) => {
      // TODO: catch error (test by asAdmin: false)
      const {messages, response_metadata: {next_cursor: nextCursor} = {}} = await this.apiCall('conversations.replies', {channel, ts, cursor}, {asAdmin: true})

      return nextCursor ? [...messages, ...await fetchComments(nextCursor)] : messages
    }

    const [mainMsg, ...comments] = await fetchComments()

    return {mainMsg, comments}
  }

  async getUsers(cursor) {
    const {members, response_metadata: {next_cursor: nextCursor} = {}} = await this.apiCall('users.list', {cursor})

    const membersMap = members.reduce((acc, {id, name}) => {
      acc[id] = name
      return acc
    }, {})

    return nextCursor ? {...membersMap, ...this.getUsers(nextCursor)} : membersMap
  }

  async moveOrder(ts, fromChannel, toChannel, data) {
    const {message: {ts: newTs}} = await this.apiCall('chat.postMessage', {
      channel: toChannel,
      as_user: true,
      ...data,
    })

    const [{mainMsg, comments}, usersMap] = await Promise.all([
      this.getComments(ts, fromChannel),
      this.getUsers(),
    ])

    if (mainMsg.reactions) {
      for (const {name: reaction} of mainMsg.reactions) {
        await this.addReaction(reaction, toChannel, newTs)
      }
    }

    for (const {user, text, ts: commentTs, reactions = [], files} of comments) {
      const mainText = !user || user === this.botUserId ? (text || ' ') : `<@${user}> ${getTS(msgTsToDate(commentTs))}:\n\n${text}`
      const filesText = files && files.map((file) => `${file.title}: ${file.permalink}`).join('\n')

      const fullText = `${mainText}${filesText ? `\n\n${filesText}` : ''}`

      const finalText = fullText.replace(
        /<@([A-Z0-9]+)>/g,
        (match, userId) =>
          usersMap[userId]
            ? `<${SLACK_URL[this.variant]}/team/${userId}|${usersMap[userId]}>`
            : `<@${userId}>`,
      )

      const {message: {ts: newCommentTs}} = await this.apiCall('chat.postMessage', {
        channel: toChannel,
        thread_ts: newTs,
        text: finalText,
      })

      for (const {name: reaction} of reactions) {
        await this.addReaction(reaction, toChannel, newCommentTs)
      }

      // delete the comment. note: admin rights needed to delete other users' messages
      // TODO: catch error (test by asAdmin: false)
      await this.apiCall('chat.delete', {channel: fromChannel, ts: commentTs}, {asAdmin: true})
    }

    // delete the chat message as it is already reposted to another channel
    // TODO: catch error
    await this.apiCall('chat.delete', {channel: fromChannel, ts}, {asAdmin: false})
  }

  async handleOrderAction(event) {
    const actionName = event.actions[0].name
    const orderId = event.callback_id.substring(1)
    const msg = event.original_message
    const attachments = msg.attachments.length === 1
      ? {...msg.attachments, actions: []} // legacy format
      : msg.attachments.filter((att) => !att.actions)
    // find the section with button actions that's not the Archive
    const buttonsAtt = msg.attachments.find((att) => att.actions && att.actions[0].type === 'button' && att.text !== 'Archive')
    const msgButtons = buttonsAtt && buttonsAtt.actions

    if (orderId === '-' && actionName !== 'archive') {
      throw new Error(`Invalid order ID for action ${actionName}`)
    }

    const {order, items} = orderId === '-' ? {} : await this.getOrderAndItemsFromDb(orderId)

    if (actionName === 'forward-to-channel') { // Forward to office channel
      // this action shouldn't happen on wincent
      await this.moveOrder(msg.ts, event.channel.id, this.getCityChannel(order.office), {
        attachments: [
          ...attachments,
          // no msgButtons here - resets the
          ...getAdminSections(this.variant, orderId, 'add-to-cart'),
        ],
      })
    } else if (actionName === 'decline') { // Notify user - decline
      await this.removeReaction('no_entry_sign', event.channel.id, msg.ts)

      await this.sendUserInfo(event, 'There was an issue with your order. Somebody from backoffice will contact you about it soon.', createOrderFromDb(order, items))

      await this.addReaction('no_entry_sign', event.channel.id, msg.ts)
    } else if (actionName === 'discard') { // Discard order
      await this.removeReaction('x', event.channel.id, msg.ts)

      await updateStatusInSheets(this.variant, this.config.google.spreadsheetId, order, items, 'discarded')
        .then(() => this.apiCall('chat.delete', {channel: event.channel.id, ts: msg.ts}))
        .catch((err) => {
          logger.error('Failed to update sheet', err)
          this.addReaction('x', event.channel.id, msg.ts)
        })
    } else if (actionName === 'archive') { // Move to archive
      await this.moveOrder(msg.ts, event.channel.id, this.config.channels.archive, {
        attachments: [
          ...attachments,
          ...(orderId === '-' ? [] : [getArchiveSection(orderId, true)]),
        ],
      })
    } else if (actionName === 'unarchive') { // Move from archive
      let targetChannel, primaryBtn
      if (this.variant === 'wincent') {
        targetChannel = this.config.channels.orders
        primaryBtn = 'accepted' // TODO: select whatever there was selected before?
      } else {
        targetChannel = this.getCityChannel(order.office)
        primaryBtn = 'add-to-cart'
      }

      await this.moveOrder(msg.ts, event.channel.id, targetChannel, {
        attachments: [
          ...attachments,
          ...getAdminSections(this.variant, orderId, primaryBtn),
        ],
      })
    } else if (actionName === 'add-to-cart') { // Add items to cart
      // not called in wincent
      await this.removeReaction('shopping_trolley', event.channel.id, msg.ts)

      await addToCartAll(items)

      await this.apiCall('chat.update', {
        channel: event.channel.id,
        ts: msg.ts,
        attachments: [
          ...attachments,
          ...getAdminSections(this.variant, orderId, 'ordered', msgButtons),
        ],
      })

      await this.addReaction('shopping_trolley', event.channel.id, msg.ts)
    } else if (actionName === 'accepted') { // Notify user - accepted
      // TODO - accepted by who?
      await this.sendUserInfo(event, MESSAGES.notification.accepted, createOrderFromDb(order, items))

      await this.changeStatus({
        order,
        items,
        status: 'accepted',
        channelId: event.channel.id,
        msgTs: msg.ts,
        textAttachments: attachments,
        // no msgButtons here - need to change the set of buttons
        actionsAttachments: getAdminSections(this.variant, orderId, 'ordered'),
        statusIcon: 'heavy_check_mark',
      })
    } else if (actionName === 'ordered') { // Notify user - ordered
      await this.sendUserInfo(event, MESSAGES.notification.ordered, createOrderFromDb(order, items))

      await this.changeStatus({
        order,
        items,
        status: 'ordered',
        channelId: event.channel.id,
        msgTs: msg.ts,
        textAttachments: attachments,
        actionsAttachments: getAdminSections(this.variant, orderId, 'delivered', msgButtons),
        statusIcon: 'page_with_curl',
      })
    } else if (actionName === 'delivered') { // Notify user - delivered
      await this.sendUserInfo(event, MESSAGES.notification.delivered, createOrderFromDb(order, items))

      await this.changeStatus({
        order,
        items,
        status: 'ordered',
        channelId: event.channel.id,
        msgTs: msg.ts,
        textAttachments: attachments,
        actionsAttachments: getAdminSections(this.variant, orderId, 'subsidy', msgButtons),
        statusIcon: 'inbox_tray',
      })
    } else if (actionName === 'subsidy') { // Mark subsidy
      await this.removeReaction('money_with_wings', event.channel.id, msg.ts)

      await addSubsidyToSheets(this.variant, this.config.google.spreadsheetId, order, items)

      await this.apiCall('chat.update', {
        channel: event.channel.id,
        ts: msg.ts,
        attachments: [
          ...attachments,
          ...getAdminSections(this.variant, orderId, false, msgButtons.filter((btn) => btn.name !== 'subsidy')),
        ],
      })

      await this.addReaction('money_with_wings', event.channel.id, msg.ts)
    } else if (actionName === 'status') { // Set order status
      const status = event.actions[0].selected_options[0].value

      await this.changeStatus({
        order,
        items,
        status,
        channelId: event.channel.id,
        msgTs: msg.ts,
        textAttachments: attachments,
        actionsAttachments: msg.attachments.filter((att) => Boolean(att.actions)),
        // no reaction on manual status change
        statusIcon: null,
      })
    }
  }

  async handleUserAction(stream, order, action, actionValue, user) {
    const {channel, ts, message: {attachments: [attachment]}} = order.orderConfirmation

    const updateMessage = async (attachmentUpdate) => {
      await this.apiCall('chat.update', {channel, ts, as_user: true,
        attachments: [{...attachment, ...attachmentUpdate}],
      })
    }

    const cancelOrder = async () => {
      await updateMessage({
        pretext: ':no_entry_sign: Order canceled:',
        color: 'danger',
        actions: [],
      })
    }

    const submitOrder = async (commentMsg, forceComment) => {
      let completeNewMsg = false

      if (commentMsg) {
        completeNewMsg = true

        await updateMessage({
          actions: [forceComment ? null : NOTE_NO_ACTION, CANCEL_ORDER_ACTION].filter(Boolean),
          fields: this.getOrderFields(order),
        })

        await this.apiCall('chat.postMessage', {
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
          await this.apiCall('chat.postMessage', {
            channel: user.id,
            as_user: true,
            text: ':no_entry_sign: Canceling :point_up:',
          })
          return
        }
      }

      const dbId = await this.storeOrder(
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
      await this.notifyOfficeManager(order, dbId, user.id, order.isCompany)
      await updateMessage({
        pretext: order.isCompany ? ':office: Company order finished:' : ':woman: Personal order finished:',
        color: 'good',
        actions: [],
        fields: this.getOrderFields(order),
      })
      if (completeNewMsg) {
        await this.apiCall('chat.postMessage', {
          channel: user.id,
          as_user: true,
          text: order.isCompany ? ':office: Company order finished :point_up:' : ':woman: Personal order finished :point_up:',
        })
      }
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
          ...this.getOrderFields(order),
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
        fields: this.getOrderFields(order),
      })

      return false
    }

    // ?-personal
    if (action === 'personal') {
      order.isCompany = false
      await updateMessage({
        actions: ORDER_URGENT_ACTIONS,
        fields: [...this.getOrderFields(order), {title: 'How urgent is your order?'}],
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
        fields: [...this.getOrderFields(order), {title: ':pencil: Do you want to add a note to the order?'}],
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

  async notifyOfficeManager(order, dbId, user, isCompany) {
    const orderTypeText = isCompany ? ':office: Company' : ':woman: Personal'

    const orderAttachment = orderToAttachment(`${orderTypeText} order from <@${user}>`, this.getOrderFields(order, true))
    // note: in wincent, there is no order.office
    const orderOffice = order.office && this.getCityChannel(order.office) ? order.office : null

    await this.apiCall('chat.postMessage', {
      channel: this.config.channels.orders,
      as_user: true,
      attachments: getNewOrderAdminSections(this.variant, orderAttachment, dbId, orderOffice),
    })
  }

  async sendUserInfo(event, text, order) {
    const msg = event.original_message
    const attachment = msg.attachments[0]

    const userId = attachment.pretext.match(/<@(.+)>/)[1]

    await Promise.all([
      this.removeReaction('no_bell', event.channel.id, msg.ts),
      this.removeReaction('incoming_envelope', event.channel.id, msg.ts),
    ])

    if (!userId) {
      logger.log('error', `Failed to parse user ID from '${attachment.pretext}`)
      await this.addReaction('no_bell', event.channel.id, msg.ts)
      return false
    }

    const notifyOk = await this.notifyUser(userId, {
      attachments: [orderToAttachment(text, this.getOrderFields(order))],
    })

    if (!notifyOk) {
      await this.addReaction('no_bell', event.channel.id, msg.ts)
      return false
    }

    await this.addReaction('incoming_envelope', event.channel.id, msg.ts)

    return true
  }

  async notifyUser(userId, message) {
    const {channel: {id: channelId}, error: channelError} = await this.apiCall('conversations.open', {users: userId})

    if (!channelId) {
      logger.error(`Failed to open conversation with user '${userId}': ${channelError}`)
      return false
    }

    const {error: notifyError} = await this.apiCall('chat.postMessage', {
      ...message,
      channel: channelId,
      as_user: true,
    })

    if (notifyError) {
      logger.error(`Failed to notify user '${userId}': ${notifyError}`)
      return false
    }

    return true
  }


  async addReaction(name, channel, timestamp) {
    const {ok, error} = await this.apiCall('reactions.add', {name, channel, timestamp}, {passError: true})

    if (ok === false && error !== 'already_reacted') {
      logger.log('error', `Failed to add reaction '${name}'`)
      return false
    }

    return true
  }

  async removeReaction(name, channel, timestamp) {
    const {ok, error} = await this.apiCall('reactions.remove', {name, channel, timestamp}, {passError: true})

    if (ok === false && error !== 'no_reaction') {
      logger.log('error', `Failed to remove reaction '${name}'`)
      return false
    }

    return true
  }


  async updateOrder(order, event, user) {
    if (order.orderConfirmation) {
      const {channel, ts} = order.orderConfirmation
      await this.apiCall('chat.delete', {channel, ts})
    }

    const {info, errors} = await orderInfo(parseOrder(event.text), order.country)

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

      await this.apiCall('chat.postMessage', {
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
          ...this.getOrderFields(order),
          !order.country && {title: 'In which country is your office?'},
          order.country && !order.office && {title: 'Where do you want to pickup the order?'},
        ].filter(Boolean),
      ),
      callback_id: order.id,
      actions: getUserActions(this.variant, order),
    }

    const orderConfirmation = await this.apiCall('chat.postMessage', {
      channel: user,
      attachments: [orderAttachment],
      as_user: true,
    })

    return {...order, orderConfirmation}
  }


  itemsField(items, showPrice, order) {
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
      logError(this.variant, new Error('Empty items'), 'Empty items', '-', {
        order: logOrder(order),
        value,
        adminMsg: showPrice,
      })
    }

    return {title: 'Items', value: itemLines.join('\n'), short: false}
  }

  getOrderFields(order, adminMsg = false) {
    return [
      this.itemsField(order.items, adminMsg, order),
      adminMsg && {title: 'Total value', value: formatPrice(order.totalPrice, c.currency)},
      order.office && {title: 'Office', value: `${order.office}${order.isHome ? ' (home delivery)' : ''}`},
      order.reason && {title: order.isCompany ? 'Reason' : 'Note', value: order.reason, short: false},
      order.isUrgent !== null && {title: 'Urgent', value: order.isUrgent ? 'Yes' : 'No'},
    ]
  }

  async storeOrder(order, items) {
    const id = await knex.transaction(async (trx) => {
      order.id = (
        await trx.insert({...order, user: order.user.id}, 'id').into(this.config.dbTables.order)
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
          }, 'id').into(this.config.dbTables.orderItem))[0]

          item.dbIds.push(itemId)
        }
      }

      return order.id
    })

    await storeOrderToSheets(this.variant, this.config.google.spreadsheetId, order, Array.from(items.values()))

    return id
  }

  async getOrderAndItemsFromDb(orderId) {
    return await knex.transaction(async (trx) => {
      const order = (
        await trx
          .select('id', 'isCompany', 'user', 'office', 'isUrgent', 'isHome')
          .from(this.config.dbTables.order)
          .where('id', orderId)
      )[0]

      const items = await trx
        .select('id', 'price', 'shopId', 'count', 'url')
        .from(this.config.dbTables.orderItem)
        .where('order', orderId)

      return {order, items}
    })
  }
  /* end of Slack class */
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

function msgTsToDate(ts) {
  const [seconds] = ts.split('.')

  return new Date(parseInt(seconds, 10) * 1000)
}

function getTS(date = new Date()) {
  return moment(date).tz('Europe/Bratislava').format('YYYY-MM-DD HH:mm')
}


function formatPrice(price, currency) {
  return price && !isNaN(price) ? format(price, currency) : '???'
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
  return {info: {items: info, totalPrice, country: orderCountry, wrongCountry}, errors}
}
