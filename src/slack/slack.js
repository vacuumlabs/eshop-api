import c from '../config'
import _knex from 'knex'
import moment from 'moment-timezone'
import {getInfo, getLangByLink} from '../alza'
import {format} from '../currency'
import logger, {logError, logOrder} from '../logger'
import {storeOrder as storeOrderToSheets} from '../sheets/storeOrder'
import {updateStatus as updateStatusInSheets} from '../sheets/updateStatus'
import {CANCEL_ORDER_ACTION, CITIES_OPTIONS_TO_CITIES, HOME_VALUE, NEW_USER_GREETING, OFFICES, ORDER_NOTE_ACTIONS, ORDER_OFFICE_ACTIONS, ORDER_COMPANY_ACTIONS, ORDER_TYPE_ACTIONS, ORDER_URGENT_ACTIONS, SLACK_URL, COMPANY, PERSONAL, OFFICE, HOME, DELIVERY_PLACE_ACTIONS, NAME, MESSAGES as VARIANT_MESSAGES, INVALID_LINK_ERROR} from './constants'
import {getAdminSections, getArchiveSection, getNewOrderAdminSections, getUserActions} from './actions'
import {App, ExpressReceiver} from '@slack/bolt'

const knex = _knex(c.knex)

export class Slack {
  constructor(variant) {
    this.variant = variant
    this.config = c[variant]
    this.orders = {}

    // inspired by: https://github.com/slackapi/bolt-js/issues/212
    this.boltReceiver = new ExpressReceiver({signingSecret: this.config.slack.signingSecret, endpoints: '/'})
    this.boltApp = new App({token: this.config.slack.botToken, receiver: this.boltReceiver, extendedErrorHandler: true})
  }

  // this function shouldn't be called for wincent
  getCityChannel(officeOption) {
    const city = CITIES_OPTIONS_TO_CITIES[this.variant][officeOption]
    return this.config.channels.cities[city]
  }

  async init() {
    const response = await this.boltApp.client.auth.test()
    this.botUserId = response.user_id


    /* old Milan's code for upgrading all messages to a new message format
        - outdated, but potentially useful
        - should be ran single time, but probably wouldn't matter if by any chance it is ran multiple times
    */
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

    this.boltApp.event('message', async ({event, say}) => {
      logger.info('message handler')
      logger.verbose(`event: ${JSON.stringify(event)}`)

      if (event.subtype) return
      // safe type narrowing
      // the above check doesn't satisfy typescript - type discrimination doesn't work on undefined properties
      if (!('text' in event)) return

      const {user: userId, text: message, channel} = event

      if (this.amIMentioned(event)) {
        let order
        try {
          order = this.orders[userId]
          logger.info(`handling user message - user: '${userId}', event text: '${message}', order: ${JSON.stringify(order)}`)

          await this.handleUserMessage(message, userId, say)
        } catch (err) {
          await Promise.all([
            await say(':exclamation: Something went wrong, please try again.'),
            await logError(this.boltApp, this.variant, err, 'User message error', userId, {
              msg: message,
              order: logOrder(order),
            }),
          ])
        }
        return
      }

      if (channel === this.config.channels.news) {
        // TODO: require confirmation before sending a company-wide message
        await this.announceToAll(message)
        return
      }
    })

    this.boltApp.event('team_join', ({event}) => this.greetNewUser(event.user.id))

    // catch everything with a callback_id here
    this.boltApp.action({callback_id: /.*/g}, async ({body, action, ack, respond, say}) => {
      try {
        logger.info('action handler')
        logger.info(`action: ${JSON.stringify(action)}`)
        logger.verbose(`body: ${JSON.stringify(body)}`)

        await ack()

        // safe type narrowing
        // we know the handled body is always an interactive message payload, but typescript doesn't
        if (body.type !== 'interactive_message') return

        const {callback_id, user: {id: userId, name: username}, original_message: originalMessage, channel: {id: channelId}} = body
        logger.info(`action callback_id: ${callback_id}, username: ${username}`)

        // admin action
        if (callback_id && callback_id.startsWith('O')) {
          const orderId = callback_id.substring(1)
          logger.info(`handling admin action - orderId: ${orderId}`)

          try {
            await this.handleAdminAction(action, orderId, originalMessage, channelId)
          } catch (err) {
            await say(':exclamation: Something went wrong.')
            await logError(this.boltApp, this.variant, err, 'Admin action error', userId, {
              username,
              action,
              callback_id,
            })
          }
          return
        }

        // user action
        const order = this.orders[userId]

        if (order) {
          // save user's name in the order - used for logging and when storing to sheets
          if (!order.user.name) order.user.name = this.orders[userId].user.name = username

          logger.info(`handling user action - order: ${JSON.stringify(order)}`)

          try {
            this.handleUserAction(action, userId)
          } catch (err) {
            await say(':exclamation: Something went wrong, please try again.')
            await logError(this.boltApp, this.variant, err, 'User action error', userId, {
              action,
              order: logOrder(order),
            })
          }
        } else {
          logger.info(`order timeout - user: ${username}`)

          await respond(':exclamation: The order has timed out. Create a new order please.')
        }
      } catch (err) {
        await respond(':exclamation: Something went wrong.')
        await logError(this.boltApp, this.variant, err, 'General action error', body.user.id, {
          action,
          callback_id: body.callback_id,
        })
      }
    })

    /**
      @type import('@slack/bolt/dist/App').ExtendedErrorHandler
    */
    const errorHandler = async ({error: {code, message, name, req, stack}, context, body}) => {
      logger.error(`code: ${code}, message: ${message}, name: ${name}, req: ${JSON.stringify(req)}, stack: ${stack}, context: ${JSON.stringify(context)}, body: ${JSON.stringify(body)}`)
    }
    this.boltApp.error(errorHandler)
  }

  amIMentioned(event) {
    // ignore messages from the bot
    if (event.user === this.botUserId) return false
    // user is writing the bot (D-irect message)
    if (event.channel[0] === 'D') return true
    // the bot is mentioned
    if (event.text.match(`<@${this.botUserId}>`)) return true
    return false
  }

  async announceToAll(message) {
    try {
      const users =
      (await this.boltApp.client.users.list())
        .members
        .filter((u) => u.is_bot === false)

      for (const u of users) {
        if (message === 'help') {
          await this.greetNewUser(u.id)
        } else {
          try {
            await this.boltApp.client.chat.postMessage({channel: u.id, text: message})
          } catch (err) {
            logger.error(`Failed to send a message to user '${u.id}': ${err}`)
          }
        }
      }
    } catch (err) {
      logger.error(`Failed to get list of users: ${err}`)
    }
  }

  async greetNewUser(userId) {
    try {
      await this.boltApp.client.chat.postMessage({channel: userId, text: NEW_USER_GREETING[this.variant]})
    } catch (err) {
      logger.error(`Failed to greet a new user '${userId}': ${err}`)
    }
  }

  async submitOrder(userId) {
    const order = this.orders[userId]
    const dbId = await this.storeOrder(order)

    await this.notifyOfficeManager(order, dbId, userId, order.isCompany)
    await this.updateMessage(order, {
      pretext: order.isCompany ? ':office: Company order finished:' : ':woman: Personal order finished:',
      color: 'good',
      actions: [],
      fields: this.getOrderFields(order),
    })
    try {
      await this.boltApp.client.chat.postMessage({
        channel: userId,
        text: order.isCompany ? ':office: Company order finished :point_up:' : ':woman: Personal order finished :point_up:',
      })
    } catch (err) {
      logger.error(`Failed to post 'order finished' message to user '${userId}': ${err}`)
    }
    delete this.orders[userId] // remove order from memory
  }

  async handleUserMessage(message, userId, say) {
    let order = this.orders[userId] || {
      id: userId,
      // name is added later when first action is handled
      user: {id: userId, name: undefined},
      items: new Map(),
      totalPrice: 0,
      country: null,
      office: null,
      orderConfirmation: null,
      isCompany: null,
      isUrgent: null,
      isHome: null,
    }

    if (order.messages === undefined) { // Initial message for entering item links
      order = await this.updateOrder(order, message, userId, say)
    } else {
      const name = order.messages.shift()[NAME]
      order[name] = message

      if (order.messages.length === 0) { // user actions finished
        this.submitOrder(userId)
      } else {
        this.updateQuestion(userId)
      }
    }

    this.orders[userId] = order
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

    try {
      await updateStatusInSheets(this.variant, this.config.google.spreadsheetId, order, items, status)
      try {
        this.boltApp.client.chat.update({
          channel: channelId,
          ts: msgTs,
          text: '',
          attachments: [
          // *Status:* is the new message format. temporarily, we need to support the old format,
          // and it seems checking just *Status* doesn't work, so dual check here it is
            ...textAttachments.map((att) => att.text && (att.text.startsWith('*Status*') || att.text.startsWith('*Status:*')) ? {...att, text: `*Status:* ${status}`} : att),
            ...actionsAttachments,
          ],
        })
      } catch (err) {
        logger.error(`Failed to update a chat on '${channelId}': ${err}`)
      }
    } catch (err) {
      logger.error('Failed to update sheet', err)
      this.addReaction('x', channelId, msgTs)
    }

    if (statusIcon) {
      await this.addReaction(statusIcon, channelId, msgTs)
    }
  }

  async getComments(ts, channel) {
    const fetchComments = async (cursor) => {
      // error is caught later
      const {messages, response_metadata: {next_cursor: nextCursor} = {}} = await this.boltApp.client.conversations.replies({channel, ts, cursor})
      return nextCursor ? [...messages, ...await fetchComments(nextCursor)] : messages
    }

    try {
      const [mainMsg, ...comments] = await fetchComments()
      return {mainMsg, comments}
    } catch (err) {
      logger.error(`Failed to fetch comments: ${err}`)
      throw err
    }
  }

  async getUsers() {
    const fetchUsers = async (cursor) => {
      const {members, response_metadata: {next_cursor: nextCursor} = {}} = await this.boltApp.client.users.list({cursor})
      const membersMap = members.reduce((acc, {id, name}) => {
        acc[id] = name
        return acc
      }, {})
      return nextCursor ? {...membersMap, ...fetchUsers(nextCursor)} : membersMap
    }

    try {
      return await fetchUsers()
    } catch (err) {
      logger.error(`Failed to get list of users: ${err}`)
      throw err
    }
  }

  async moveOrder(ts, fromChannel, toChannel, data) {
    let newTs
    try {
      ({message: {ts: newTs}} = await this.boltApp.client.chat.postMessage({
        channel: toChannel,
        ...data,
      }))
    } catch (err) {
      logger.error(`Failed to move order from '${fromChannel}' to '${toChannel}': ${err}`)
    }

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
      let newCommentTs
      try {
        ({message: {ts: newCommentTs}} = await this.boltApp.client.chat.postMessage({
          channel: toChannel,
          thread_ts: newTs,
          text: finalText,
        }))
      } catch (err) {
        logger.error(`Failed to post a message: '${finalText}' on channel: '${toChannel}': ${err}`)
      }

      for (const {name: reaction} of reactions) {
        await this.addReaction(reaction, toChannel, newCommentTs)
      }

      // delete the comment. note: admin rights needed to delete other users' messages
      try {
        await this.boltApp.client.chat.delete({channel: fromChannel, ts: commentTs, token: this.config.slack.adminToken})
      } catch (err) {
        logger.error(`Failed to delete a comment on '${fromChannel}, ts '${ts}': ${err}`)
      }
    }

    // delete the chat message as it is already reposted to another channel
    try {
      await this.boltApp.client.chat.delete({channel: fromChannel, ts})
    } catch (err) {
      logger.error(`Failed to delete chat a message on '${fromChannel}', ts '${ts}': ${err}`)
    }
  }

  async handleAdminAction(action, orderId, originalMessage, channelId) {
    const actionName = action.name
    const attachments = originalMessage.attachments.length === 1
      ? {...originalMessage.attachments, actions: []} // legacy format
      : originalMessage.attachments.filter((att) => !att.actions)
    // find the section with button actions that's not the Archive
    const buttonsAtt = originalMessage.attachments.find((att) => att.actions && att.actions[0].type === 'button' && att.text !== 'Archive')
    const msgButtons = buttonsAtt && buttonsAtt.actions

    const NOTIFICATION = VARIANT_MESSAGES[this.variant].notification

    if (orderId === '-' && actionName !== 'archive') {
      throw new Error(`Invalid order ID for action ${actionName}`)
    }

    const {order, items} = orderId === '-' ? {} : await this.getOrderAndItemsFromDb(orderId)

    if (actionName === 'forward-to-channel') { // Forward to office channel
      // this action shouldn't happen on wincent
      await this.moveOrder(originalMessage.ts, channelId, this.getCityChannel(order.office), {
        attachments: [
          ...attachments,
          // no msgButtons here - resets the
          ...getAdminSections(this.variant, orderId, 'ordered'),
        ],
      })
    } else if (actionName === 'decline') { // Notify user - decline
      await this.removeReaction('no_entry_sign', channelId, originalMessage.ts)

      await this.sendUserInfo(originalMessage, channelId, 'There was an issue with your order. Somebody from backoffice will contact you about it soon.', createOrderFromDb(order, items))

      await this.addReaction('no_entry_sign', channelId, originalMessage.ts)
    } else if (actionName === 'discard') { // Discard order
      await this.removeReaction('x', channelId, originalMessage.ts)

      try {
        await updateStatusInSheets(this.variant, this.config.google.spreadsheetId, order, items, 'discarded')
        try {
          this.boltApp.client.chat.delete({channel: channelId, ts: originalMessage.ts})
        } catch (err) {
          logger.error(`Failed to delete a chat message on '${channelId}': ${err}`)
        }
      } catch (err) {
        logger.error('Failed to update sheet', err)
        this.addReaction('x', channelId, originalMessage.ts)
      }
    } else if (actionName === 'archive') { // Move to archive
      await this.moveOrder(originalMessage.ts, channelId, this.config.channels.archive, {
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
        primaryBtn = 'ordered' // TODO: doesn't make sense to preselect on unarchive
      }

      await this.moveOrder(originalMessage.ts, channelId, targetChannel, {
        attachments: [
          ...attachments,
          ...getAdminSections(this.variant, orderId, primaryBtn),
        ],
      })
    // } else if (actionName === 'add-to-cart') { // Add items to cart
    //   // not called in wincent
    //   await this.removeReaction('shopping_trolley', channelId, originalMessage.ts)

    //   await addToCartAll(items)

    //   await this.apiCall('chat.update', {
    //     channel: channelId,
    //     ts: msg.ts,
    //     attachments: [
    //       ...attachments,
    //       ...getAdminSections(this.variant, orderId, 'ordered', msgButtons),
    //     ],
    //   })

    //   await this.addReaction('shopping_trolley', channelId, originalMessage.ts)
    } else if (actionName === 'accepted') { // Notify user - accepted
      // TODO - accepted by who?
      await this.sendUserInfo(originalMessage, channelId, NOTIFICATION.accepted, createOrderFromDb(order, items))

      await this.changeStatus({
        order,
        items,
        status: 'accepted',
        channelId,
        msgTs: originalMessage.ts,
        textAttachments: attachments,
        // no msgButtons here - need to change the set of buttons
        actionsAttachments: getAdminSections(this.variant, orderId, 'ordered'),
        statusIcon: 'heavy_check_mark',
      })
    } else if (actionName === 'ordered') { // Notify user - ordered
      await this.sendUserInfo(originalMessage, channelId, NOTIFICATION.ordered, createOrderFromDb(order, items))

      await this.changeStatus({
        order,
        items,
        status: 'ordered',
        channelId,
        msgTs: originalMessage.ts,
        textAttachments: attachments,
        actionsAttachments: getAdminSections(this.variant, orderId, 'delivered', msgButtons),
        statusIcon: 'page_with_curl',
      })
    } else if (actionName === 'delivered') { // Notify user - delivered
      await this.sendUserInfo(originalMessage, channelId, NOTIFICATION.delivered[order.isCompany ? COMPANY : PERSONAL][order.isHome ? HOME : OFFICE], createOrderFromDb(order, items))

      await this.changeStatus({
        order,
        items,
        status: 'delivered',
        channelId,
        msgTs: originalMessage.ts,
        textAttachments: attachments,
        actionsAttachments: getAdminSections(this.variant, orderId, undefined, msgButtons),
        statusIcon: 'inbox_tray',
      })
    } else if (actionName === 'status') { // Set order status
      const status = action.selected_options[0].value

      await this.changeStatus({
        order,
        items,
        status,
        channelId,
        msgTs: originalMessage.ts,
        textAttachments: attachments,
        actionsAttachments: originalMessage.attachments.filter((att) => Boolean(att.actions)),
        // no reaction on manual status change
        statusIcon: null,
      })
    }
  }

  async updateQuestion(userId, passedOrder) {
    const order = this.orders[userId]
    const userMessage = order.messages[0]
    logger.debug(`running updateQuestion. userMessage: ${JSON.stringify(userMessage)}`)

    if (userMessage) {
      const {question, button: additionalButton} = userMessage
      await this.updateMessage(order, {
        actions: [additionalButton, CANCEL_ORDER_ACTION].filter(Boolean),
        fields: this.getOrderFields(order),
      })

      try {
        await this.boltApp.client.chat.postMessage({
          channel: userId,
          text: question,
        })
      } catch (err) {
        logger.error(`Failed to post a message '${question}' to user '${userId}': ${err}`)
      }
    } else {
      logger.error(`No message to show to user '${userId}. order: ${JSON.stringify(order)}\npassedOrder: ${JSON.stringify(passedOrder)}`)
    }
  }

  async updateMessage(order, attachmentUpdate) {
    const {channel, ts, message: {attachments: [attachment]}} = order.orderConfirmation
    try {
      await this.boltApp.client.chat.update({ts, channel, text: ' ', attachments: [{...attachment, ...attachmentUpdate}]})
    } catch (err) {
      logger.error(`Failed to update a chat on '${channel}': ${err}`)
    }
  }

  async handleUserAction(action, userId) {
    const order = this.orders[userId]
    const {name: actionName, value: actionValue} = action

    const MESSAGES = VARIANT_MESSAGES[this.variant]

    const cancelOrder = async () => {
      await this.updateMessage(order, {
        pretext: ':no_entry_sign: Order canceled:',
        color: 'danger',
        actions: [],
      })
    }

    if (actionName === 'cancel') {
      await cancelOrder()
      delete this.orders[userId] // remove order from memory
      return
    }

    if (actionName === 'country') {

      order.country = actionValue
      await this.updateMessage(order, {
        actions: DELIVERY_PLACE_ACTIONS,
        fields: [
          ...this.getOrderFields(order),
          {title: 'Where do you want to pickup the order?'},
        ],
      })
    }

    // office/home
    if (actionName === 'delivery') {
      order.isHome = actionValue === HOME_VALUE
      await this.updateMessage(order, {
        actions: ORDER_OFFICE_ACTIONS[order.country],
        fields: [
          ...this.getOrderFields(order),
          {title: 'Select the office you belong to.'},
        ],
      })
    }

    // office
    if (actionName === 'office') {
      order.office = actionValue
      await this.updateMessage(order, {
        actions: ORDER_TYPE_ACTIONS,
        fields: this.getOrderFields(order),
      })

    }

    // ?-is_personal
    if (actionName === 'is_personal') {
      order.isCompany = false
      await this.updateMessage(order, {
        actions: ORDER_URGENT_ACTIONS,
        fields: [...this.getOrderFields(order), {title: 'How urgent is your order?'}],
      })
    }

    // ?-is_personal-urgent
    if (actionName === 'urgent') {
      order.isUrgent = actionValue === 'urgent-yes'

      // home-is_personal-urgent
      if (order.isHome) {
        order.messages = MESSAGES.home.personal
      } else {
        // office-is_personal-urgent
        await this.updateMessage(order, {
          actions: ORDER_NOTE_ACTIONS,
          fields: [...this.getOrderFields(order), {title: ':pencil: Do you want to add a note to the order?'}],
        })
      }
    }

    // office-is_personal-?-note
    if (actionName === 'note') {
      if (actionValue === 'note-yes') {
        order.messages = MESSAGES.office.personal.note
      } else {
        this.submitOrder(userId)
      }
    }

    // ?-is_company
    if (actionName === 'is_company') {
      order.isCompany = true

      // for wincent, don't go into company selection
      if (this.variant === 'wincent') {
        order.messages = order.isHome ? MESSAGES.home.company : MESSAGES.office.company
      } else {
        // company selection for vacuumlabs (and test)
        await this.updateMessage(order, {
          actions: ORDER_COMPANY_ACTIONS,
          fields: [...this.getOrderFields(order), {title: 'Select your company:'}],
        })
      }
    }

    // ?-is_company-company
    // this is never run for wincent
    if (actionName === 'company') {
      order.company = action.selected_options[0].value

      order.messages = order.isHome ? MESSAGES.home.company : MESSAGES.office.company

      // debug messages for some weird stuff going on on production SOMETIMES
      logger.debug(`handled spinoff action. spinoff: ${order.company}, order.messages: ${JSON.stringify(order.messages)}`)
      if (!order.messages || order.messages.length === 0) logger.error(`order.messages are wrongly empty. order.messages = ${JSON.stringify(order.messages)}\norder.isHome ? MESSAGES.home.company : MESSAGES.office.company = ${JSON.stringify(order.isHome ? MESSAGES.home.company : MESSAGES.office.company)}\nMESSAGES.home.company = ${JSON.stringify(MESSAGES.home.company)} `)
    }

    this.orders[userId] = order // update order

    if (order.messages !== undefined && order.messages.length > 0) { // If order actions finished, update question
      this.updateQuestion(userId, order)
    }
  }

  async notifyOfficeManager(order, dbId, user, isCompany) {
    const orderTypeText = isCompany ? ':office: Company' : ':woman: Personal'

    const orderAttachment = orderToAttachment(`${orderTypeText} order from <@${user}>`, this.getOrderFields(order, true))
    // note: in wincent, there is no order.office
    const orderOffice = order.office && this.getCityChannel(order.office) ? order.office : null

    try {
      await this.boltApp.client.chat.postMessage({
        channel: this.config.channels.orders,
        attachments: getNewOrderAdminSections(this.variant, orderAttachment, dbId, orderOffice),
      })
    } catch (err) {
      logger.error(`Failed to post 'order information' on orders channel: ${err}`)
    }
  }

  async sendUserInfo(originalMessage, channelId, text, order) {
    const attachment = originalMessage.attachments[0]

    const userId = attachment.pretext.match(/<@(.+)>/)[1]

    await Promise.all([
      this.removeReaction('no_bell', channelId, originalMessage.ts),
      this.removeReaction('incoming_envelope', channelId, originalMessage.ts),
    ])

    if (!userId) {
      logger.log('error', `Failed to parse user ID from '${attachment.pretext}`)
      await this.addReaction('no_bell', channelId, originalMessage.ts)
      return false
    }

    const notifyOk = await this.notifyUser(userId, {
      attachments: [orderToAttachment(text, this.getOrderFields(order))],
    })

    if (!notifyOk) {
      await this.addReaction('no_bell', channelId, originalMessage.ts)
      return false
    }

    await this.addReaction('incoming_envelope', channelId, originalMessage.ts)

    return true
  }

  async notifyUser(userId, message) {
    let channelId
    try {
      ({channel: {id: channelId}} = await this.boltApp.client.conversations.open({users: userId}))
    } catch (err) {
      logger.error(`Failed to open conversation with user '${userId}': ${err}`)
    }

    try {
      await this.boltApp.client.chat.postMessage({
        ...message,
        channel: channelId,
      })
    } catch (err) {
      logger.error(`Failed to notify user '${userId}': ${err}`)
      return false
    }

    return true
  }


  async addReaction(name, channel, timestamp) {
    try {
      await this.boltApp.client.reactions.add({name, channel, timestamp})
    } catch (err) {
      // already_reacted error is acceptable, don't even log it
      if (err.message === 'An API error occurred: already_reacted') return

      // just log the error, don't let it bubble up
      logger.error(`Failed to add reaction '${name}'`)
    }
  }

  async removeReaction(name, channel, timestamp) {
    try {
      await this.boltApp.client.reactions.remove({name, channel, timestamp})
    } catch (err) {
      // no_reaction is thrown when:
      // - the reaction is currently not on the message
      // - the reaction doesn't even exist
      if (err.message === 'An API error occurred: no_reaction') return

      // just log the error, don't let it bubble up
      logger.error(`Failed to remove reaction '${name}'. ${err}`)
    }
  }

  async updateOrder(order, message, user, say) {
    if (order.orderConfirmation) {
      const {channel, ts} = order.orderConfirmation
      try {
        await this.boltApp.client.chat.delete({channel, ts})
      } catch (err) {
        logger.error(`Failed to delete message on channel '${channel}': ${err}`)
      }
    }

    const items = parseOrder(message)
    const {info} = await orderInfo(items, order.country)

    for (const i of info.items) {
      if (order.items.get(i.id)) order.items.get(i.id).count += i.count
      else order.items.set(i.id, i)
    }

    order.totalPrice += info.totalPrice

    if (order.items.size > 0) {
      order.country = info.country
    }

    const totalCount = Array.from(order.items.entries()).reduce((acc, entry) => acc + entry[1], 0)

    if (totalCount === 0) {
      await say(INVALID_LINK_ERROR)
      return undefined
    }

    const orderAttachment = {
      ...orderToAttachment(
        [
          items.length === 0 && INVALID_LINK_ERROR,
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
      fallback: ' ', // To avoid warning message in logs
    }

    try {
      const orderConfirmation = await this.boltApp.client.chat.postMessage({
        channel: user,
        attachments: [orderAttachment],
        text: ' ',
      })

      return {...order, orderConfirmation}
    } catch (err) {
      logger.error(`Failed to post a message to user '${user}': ${err}`)
      throw err
    }
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
      logError(this.boltApp, this.variant, new Error('Empty items'), 'Empty items', '-', {
        order: logOrder(order),
        value,
        adminMsg: showPrice,
      })
    }

    return {value: itemLines.join('\n'), short: false}
  }

  getOrderFields(order, adminMsg = false) {
    return [
      this.itemsField(order.items, adminMsg, order),
      adminMsg && {value: `Total value: ${formatPrice(order.totalPrice, c.currency)}`},
      order.office && {value: `Office: ${order.office}${order.isHome ? ' (home delivery)' : ''}`},
      order.company && {value: `Company: ${order.company}`},
      order.reason && {value: `${order.isCompany ? 'Reason' : 'Note'}: ${order.reason}`, short: false},
      order.manager && {value: `Manager: ${order.manager}`},
      order.isUrgent !== null && {value: order.isUrgent ? 'Urgent: Yes' : 'Urgent: No'},
    ]
  }

  async storeOrder(order) {
    const {user, orderConfirmation, isCompany, office, reason, isUrgent, isHome, company, manager, items} = order
    const id = await knex.transaction(async (trx) => {
      const data = {
        user: user.id,
        ts: orderConfirmation.ts,
        isCompany,
        office,
        reason,
        isUrgent,
        isHome,
        ...this.variant === 'wincent' ? {} : {company, manager},
      }
      logger.info(`storing order data to the db: ${JSON.stringify(data)}`)
      const orderInsertResult = await trx.insert(data, ['id']).into(this.config.dbTables.order)

      const dbId = orderInsertResult[0].id

      for (const item of items.values()) {
        item.dbIds = []

        for (let i = 0; i < item.count; i++) {
          const itemInsertResult = await trx.insert({
            order: dbId,
            shopId: item.id,
            count: 1,
            url: item.url,
            price: item.price,
          }, ['id']).into(this.config.dbTables.orderItem)

          const itemId = itemInsertResult[0].id

          item.dbIds.push(itemId)
        }
      }

      return dbId
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
    isUrgent: orderData.isUrgent,
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
  // optional whitespace, optional digits, optional "x", optional whitespace, "<http", string without whitespace, ">"
  const re = /\s*(\d*)x?\s*<(http[^\s]+)>/g
  let matches
  const goods = []
  while ((matches = re.exec(text)) !== null) {
    // first capture group - digits
    if (matches[1] === '') matches[1] = '1'
    // second capture group - url
    const link = matches[2]
    // slack sometimes sends the link with the text that should be displayed after '|', e.g. the truncated link
    const justLink = link.split('|')[0]
    // link could be too long to process later, containing many useless query params. e.g. 'fbclid'
    // however, we (probably) can't just remove all query params - the 'o' param may be useful
    const url = justLink.length > 250 ? justLink.slice(0, 250) : justLink

    goods.push({url, count: parseInt(matches[1], 10)})
  }
  return goods
}

async function orderInfo(items, country) {
  const info = []
  let totalPrice = 0
  let wrongCountry = false
  let orderCountry = country
  for (const item of items) {
    // eslint-disable-next-line no-loop-func
    await (async function() {
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
  return {info: {items: info, totalPrice, country: orderCountry, wrongCountry}}
}
