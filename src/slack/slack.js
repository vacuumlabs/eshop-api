import c from '../config'
import _knex from 'knex'
import {createChannel} from 'yacol'
import moment from 'moment-timezone'
import {getInfo, getLangByLink} from '../alza'
import {format} from '../currency'
import logger, {logError, logOrder} from '../logger'
import {storeOrder as storeOrderToSheets} from '../sheets/storeOrder'
import {updateStatus as updateStatusInSheets} from '../sheets/updateStatus'
import {CANCEL_ORDER_ACTION, CITIES_OPTIONS_TO_CITIES, HOME_VALUE, NEW_USER_GREETING, NOTE_NO_ACTION, OFFICES, ORDER_NOTE_ACTIONS, ORDER_OFFICE_ACTIONS, ORDER_SPINOFF_ACTIONS, ORDER_TYPE_ACTIONS, ORDER_URGENT_ACTIONS, SLACK_URL, COMPANY, PERSONAL, OFFICE, HOME, DELIVERY_PLACE_ACTIONS, MESSAGES as VARIANT_MESSAGES} from './constants'
import {getAdminSections, getArchiveSection, getNewOrderAdminSections, getUserActions} from './actions'
import {App, ExpressReceiver} from '@slack/bolt'

const knex = _knex(c.knex)

export class Slack {
  constructor(variant) {
    this.variant = variant
    this.config = c[variant]
    this.streams = {}
    this.pendingActions = {}
    this.actionsCount = 0

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

    // TODO: inline handleMessage
    this.boltApp.event('message', ({event}) => this.handleMessage(event))

    this.boltApp.event('team_join', ({event}) => this.greetNewUser(event.user.id))

    // catch everything with a callback_id here
    this.boltApp.action({callback_id: /.*/g}, async ({body, action, ack, respond, say}) => {
      try {
        logger.info(`action: ${JSON.stringify(action, null, 2)}`)
        logger.verbose(`body: ${JSON.stringify(body, null, 2)}`)

        await ack()

        const callback_id = body.callback_id

        logger.info(`action callback_id: ${callback_id}, username: ${body.user.name}`)

        // admin action
        if (callback_id && callback_id.startsWith('O')) {
          try {
            await this.handleOrderAction(body)
          } catch (error) {
            await say(':exclamation: Something went wrong.')
            await logError(this.boltApp, this.variant, error, 'Admin action error', body.user.id, {
              action,
              callback_id,
            })
          }
          return
        }

        // user action
        // TODO: handle user's action right here, don't use stream
        const actionStream = this.pendingActions[callback_id]
        if (actionStream) {
          actionStream.put({...body, type: 'action'})
        } else {
          await respond(':exclamation: The order has timed out. Create a new order please.')
        }
      } catch (error) {
        await respond(':exclamation: Something went wrong.')
        await logError(this.boltApp, this.variant, error, 'General action error', body.user.id, {
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

  nextUUID() {
    return (`${Date.now()}#${this.actionsCount++}`)
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

  streamForUser(userId) {
    if (this.streams[userId] == null) {
      this.streams[userId] = createChannel()
      this.listenUser(this.streams[userId], userId)
    }
    return this.streams[userId]
  }

  async announceToAll(message) {
    const users =
    (await this.boltApp.client.users.list())
      .members
      .filter((u) => u.is_bot === false)

    for (const u of users) {
      if (message === 'help') await this.greetNewUser(u.id)
      else await this.boltApp.client.chat.postMessage({channel: u.id, as_user: true, text: message})
    }
  }

  async greetNewUser(userId) {
    await this.boltApp.client.chat.postMessage({channel: userId, as_user: true, text: NEW_USER_GREETING[this.variant]})
  }

  // used as @slack/bolt message event handler
  async handleMessage(event) {
    logger.info('message event')

    if (event.subtype) return

    if (this.amIMentioned(event)) {
      this.streamForUser(event.user).put(event)
      return
    }

    if (event.channel === this.config.channels.news) {
      // TODO: require confirmation before sending a company-wide message
      await this.announceToAll(event.text)
      return
    }
  }

  showError(channel, ts, msg) {
    const text = `:exclamation: ${msg}`
    logger.warn(`showed error to user: ${text}`)
    return this.boltApp.client.chat[ts ? 'update' : 'postMessage']({channel, ts, as_user: true, text, attachments: []})
  }

  async listenUser(stream, userId) {
    const newOrder = () => ({
      id: null,
      items: new Map(),
      totalPrice: 0,
      country: null,
      office: null,
      orderConfirmation: null,
      isCompany: null,
      isUrgent: null,
      isHome: null,
    })

    const destroyOrder = (order) => {
      if (order.id) delete this.pendingActions[order.id]
    }

    for (;;) {
      let order = newOrder()

      for (;;) {
        const event = await stream.take()

        if (event.type === 'action') {
          let finished

          try {
            finished = await this.handleUserAction(
              stream,
              order,
              event.actions[0],
              event.user,
            )
          } catch (err) {
            finished = true

            await logError(this.boltApp, this.variant, err, 'User action error', event.user.id, {
              action: event.actions[0].name,
              value: event.actions[0].value,
              order: logOrder(order),
            })
            try {
              await this.showError(order.orderConfirmation.channel, event.original_message.ts, 'Something went wrong, please try again.')
            } catch (err) {
              logger.error(`couldn't show error to the user. error: ${err}`)
            }
          }

          if (finished) {
            break
          }
        }

        if (event.type === 'message') {
          const newId = this.nextUUID()
          this.pendingActions[newId] = stream
          order.id = newId

          try {
            order = await this.updateOrder(order, event, userId)
          } catch (err) {
            await logError(this.boltApp, this.variant, err, 'User order error', userId, {
              msg: event.text,
              order: logOrder(order),
            })
            await this.showError(userId, null, 'Something went wrong, please try again.') // Pass null instead of event.original_message.ts, as event with type === 'message' doesn't contain original_message
          }
        }
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
      .then(() => this.boltApp.client.chat.update({
        channel: channelId,
        ts: msgTs,
        text: '',
        attachments: [
        // *Status:* is the new message format. temporarily, we need to support the old format,
        // and it seems checking just *Status* doesn't work, so dual check here it is
          ...textAttachments.map((att) => att.text && (att.text.startsWith('*Status*') || att.text.startsWith('*Status:*')) ? {...att, text: `*Status:* ${status}`} : att),
          ...actionsAttachments,
        ],
      })).catch((err) => {
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

      const {messages, response_metadata: {next_cursor: nextCursor} = {}} = await this.boltApp.client.conversations.replies({channel, ts, cursor})

      return nextCursor ? [...messages, ...await fetchComments(nextCursor)] : messages
    }

    const [mainMsg, ...comments] = await fetchComments()


    return {mainMsg, comments}
  }

  async getUsers(cursor) {
    const {members, response_metadata: {next_cursor: nextCursor} = {}} = await this.boltApp.client.users.list({cursor})

    const membersMap = members.reduce((acc, {id, name}) => {
      acc[id] = name
      return acc
    }, {})

    return nextCursor ? {...membersMap, ...this.getUsers(nextCursor)} : membersMap
  }

  async moveOrder(ts, fromChannel, toChannel, data) {
    const {message: {ts: newTs}} = await this.boltApp.client.chat.postMessage({
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

      const {message: {ts: newCommentTs}} = await this.boltApp.client.chat.postMessage({
        channel: toChannel,
        thread_ts: newTs,
        text: finalText,
      })

      for (const {name: reaction} of reactions) {
        await this.addReaction(reaction, toChannel, newCommentTs)
      }

      // delete the comment. note: admin rights needed to delete other users' messages
      // TODO: catch error (test by asAdmin: false)
      await this.boltApp.client.chat.delete({channel: fromChannel, ts: commentTs, token: this.config.slack.adminToken})
    }

    // delete the chat message as it is already reposted to another channel
    // TODO: catch error
    await this.boltApp.client.chat.delete({channel: fromChannel, ts})
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

    const NOTIFICATION = VARIANT_MESSAGES[this.variant].notification

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
          ...getAdminSections(this.variant, orderId, 'ordered'),
        ],
      })
    } else if (actionName === 'decline') { // Notify user - decline
      await this.removeReaction('no_entry_sign', event.channel.id, msg.ts)

      await this.sendUserInfo(event, 'There was an issue with your order. Somebody from backoffice will contact you about it soon.', createOrderFromDb(order, items))

      await this.addReaction('no_entry_sign', event.channel.id, msg.ts)
    } else if (actionName === 'discard') { // Discard order
      await this.removeReaction('x', event.channel.id, msg.ts)

      await updateStatusInSheets(this.variant, this.config.google.spreadsheetId, order, items, 'discarded')
        .then(() => this.boltApp.client.chat.delete({channel: event.channel.id, ts: msg.ts}))
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
        primaryBtn = 'ordered' // TODO: doesn't make sense to preselect on unarchive
      }

      await this.moveOrder(msg.ts, event.channel.id, targetChannel, {
        attachments: [
          ...attachments,
          ...getAdminSections(this.variant, orderId, primaryBtn),
        ],
      })
    // } else if (actionName === 'add-to-cart') { // Add items to cart
    //   // not called in wincent
    //   await this.removeReaction('shopping_trolley', event.channel.id, msg.ts)

    //   await addToCartAll(items)

    //   await this.apiCall('chat.update', {
    //     channel: event.channel.id,
    //     ts: msg.ts,
    //     attachments: [
    //       ...attachments,
    //       ...getAdminSections(this.variant, orderId, 'ordered', msgButtons),
    //     ],
    //   })

    //   await this.addReaction('shopping_trolley', event.channel.id, msg.ts)
    } else if (actionName === 'accepted') { // Notify user - accepted
      // TODO - accepted by who?
      await this.sendUserInfo(event, NOTIFICATION.accepted, createOrderFromDb(order, items))

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
      await this.sendUserInfo(event, NOTIFICATION.ordered, createOrderFromDb(order, items))

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
      await this.sendUserInfo(event, NOTIFICATION.delivered[order.isCompany ? COMPANY : PERSONAL][order.isHome ? HOME : OFFICE], createOrderFromDb(order, items))

      await this.changeStatus({
        order,
        items,
        status: 'delivered',
        channelId: event.channel.id,
        msgTs: msg.ts,
        textAttachments: attachments,
        actionsAttachments: getAdminSections(this.variant, orderId, undefined, msgButtons),
        statusIcon: 'inbox_tray',
      })
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

  async handleUserAction(stream, order, action, user) {
    const {name: actionName, value: actionValue} = action
    logger.info(`handling user action - name: ${actionName}, value: ${actionValue}, user: ${JSON.stringify(user)}, order: ${JSON.stringify(order)}`)

    const {channel, ts, message: {attachments: [attachment]}} = order.orderConfirmation

    const MESSAGES = VARIANT_MESSAGES[this.variant]

    const updateMessage = async (attachmentUpdate) => {
      await this.boltApp.client.chat.update({ts, channel, text: ' ', attachments: [{...attachment, ...attachmentUpdate}]})
    }

    const cancelOrder = async () => {
      await updateMessage({
        pretext: ':no_entry_sign: Order canceled:',
        color: 'danger',
        actions: [],
      })
    }

    const submitOrder = async (commentMsgObj, forceComment) => {
      let completeNewMsg = false

      if (commentMsgObj) {
        completeNewMsg = true

        for (const [key, msg] of Object.entries(commentMsgObj)) {
          await updateMessage({
            actions: [forceComment ? null : NOTE_NO_ACTION, CANCEL_ORDER_ACTION].filter(Boolean),
            fields: this.getOrderFields(order),
          })

          await this.boltApp.client.chat.postMessage({
            channel: user.id,
            as_user: true,
            text: msg,
          })

          const event = await stream.take()

          if (event.type === 'message') {
            order[key] = event.text
            completeNewMsg = true
          } else if (event.type === 'action' && event.actions[0].name === 'cancel') {
            await cancelOrder()
            await this.boltApp.client.chat.postMessage({
              channel: user.id,
              as_user: true,
              text: ':no_entry_sign: Canceling :point_up:',
            })
            return
          }
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
          isHome: order.isHome,
          ...this.variant === 'wincent' ? {} : {spinoff: order.spinoff, manager: order.manager},
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
        await this.boltApp.client.chat.postMessage({
          channel: user.id,
          as_user: true,
          text: order.isCompany ? ':office: Company order finished :point_up:' : ':woman: Personal order finished :point_up:',
        })
      }
    }

    if (actionName === 'cancel') {
      await cancelOrder()
      return true
    }

    if (actionName === 'country') {

      order.country = actionValue
      await updateMessage({
        actions: DELIVERY_PLACE_ACTIONS,
        fields: [
          ...this.getOrderFields(order),
          {title: 'Where do you want to pickup the order?'},
        ],
      })

      return false
    }

    // office/home
    if (actionName === 'delivery') {
      order.isHome = actionValue === HOME_VALUE
      await updateMessage({
        actions: ORDER_OFFICE_ACTIONS[order.country],
        fields: [
          ...this.getOrderFields(order),
          {title: 'Select the office you belong to.'},
        ],
      })

      return false
    }

    // office
    if (actionName === 'office') {
      order.office = actionValue
      await updateMessage({
        actions: ORDER_TYPE_ACTIONS,
        fields: this.getOrderFields(order),
      })

      return false
    }

    // ?-personal
    if (actionName === 'personal') {
      order.isCompany = false
      await updateMessage({
        actions: ORDER_URGENT_ACTIONS,
        fields: [...this.getOrderFields(order), {title: 'How urgent is your order?'}],
      })

      return false
    }

    // ?-personal-urgent
    if (actionName === 'urgent') {
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
    if (actionName === 'note') {
      await submitOrder(actionValue === 'note-yes' ? MESSAGES.office.personal.note : null)
      return true
    }

    // ?-company
    if (actionName === 'company') {
      order.isCompany = true

      // for wincent, don't go into spinoff selection
      if (this.variant === 'wincent') {
        await submitOrder(order.isHome ? MESSAGES.home.company : MESSAGES.office.company, true)
        return true
      }

      // spinoff selection for vacuumlabs (and test)
      await updateMessage({
        actions: ORDER_SPINOFF_ACTIONS,
        fields: [...this.getOrderFields(order), {title: 'Select your spinoff:'}],
      })

      return false
    }

    // ?-company-spinoff
    // this is never run for wincent
    if (actionName === 'spinoff') {
      order.spinoff = action.selected_options[0].value

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

    await this.boltApp.client.chat.postMessage({
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
    const {channel: {id: channelId}, error: channelError} = await this.boltApp.client.conversations.open({users: userId})

    if (!channelId) {
      logger.error(`Failed to open conversation with user '${userId}': ${channelError}`)
      return false
    }

    const {error: notifyError} = await this.boltApp.client.chat.postMessage({
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
    try {
      await this.boltApp.client.reactions.add({name, channel, timestamp})
    } catch (error) {
      // already_reacted error is acceptable, don't even log it
      if (error.message === 'An API error occurred: already_reacted') return

      // just log the error, don't let it bubble up
      logger.error(`Failed to add reaction '${name}'`)
    }
  }

  async removeReaction(name, channel, timestamp) {
    try {
      await this.boltApp.client.reactions.remove({name, channel, timestamp})
    } catch (error) {
      // no_reaction is thrown when:
      // - the reaction is currently not on the message
      // - the reaction doesn't even exist
      if (error.message === 'An API error occurred: no_reaction') return

      // just log the error, don't let it bubble up
      logger.error(`Failed to remove reaction '${name}'. ${error}`)
    }
  }

  async updateOrder(order, event, user) {
    logger.info(`handling user message - user: ${user}, event text: ${event.text}, order: ${JSON.stringify(order)}`)
    logger.info(JSON.stringify(event))

    if (order.orderConfirmation) {
      const {channel, ts} = order.orderConfirmation
      await this.boltApp.client.chat.delete({channel, ts})
    }

    const items = parseOrder(event.text)
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
      fallback: ' ', // To avoid warning message in logs
    }

    const orderConfirmation = await this.boltApp.client.chat.postMessage({
      channel: user,
      attachments: [orderAttachment],
      as_user: true,
      text: ' ',
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
      order.spinoff && {value: `Spinoff: ${order.spinoff}`},
      order.reason && {value: `${order.isCompany ? 'Reason' : 'Note'}: ${order.reason}`, short: false},
      order.manager && {value: `Manager: ${order.manager}`},
      order.isUrgent !== null && {value: order.isUrgent ? 'Urgent: Yes' : 'Urgent: No'},
    ]
  }

  async storeOrder(order, items) {
    const id = await knex.transaction(async (trx) => {
      logger.info(`storing order to the db: ${JSON.stringify(order)}`)
      const orderInsertResult = await trx.insert({...order, user: order.user.id}, ['id']).into(this.config.dbTables.order)

      order.id = orderInsertResult[0].id

      for (const item of items.values()) {
        item.dbIds = []

        for (let i = 0; i < item.count; i++) {
          const itemInsertResult = await trx.insert({
            order: order.id,
            shopId: item.id,
            count: 1,
            url: item.url,
            price: item.price,
          }, ['id']).into(this.config.dbTables.orderItem)

          const itemId = itemInsertResult[0].id

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
