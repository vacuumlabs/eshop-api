import winston from 'winston'
import c from './config'

const logger = winston.createLogger({
  level: c.logLevel,
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
})

export default logger

export async function logError(boltApp, variant, e, msg, userId, data) {
  logger.error(`[${variant}] - logError - error: ${e} | msg: ${msg} | userId: ${userId} | error.response: ${JSON.stringify(e.response)} | data: ${JSON.stringify(data)}`)

  logger.info(`logError - calling users.info for userId: ${userId}`)
  // first try to get username from user's ID
  try {
    const resp = await boltApp.client.users.info({user: userId})

    const username = resp.user.name

    const postMessageInput = {
      channel: c[variant].channels.support,
      attachments: [
        {
          pretext: `${username} (@${userId}): ${msg}`,
          text: JSON.stringify(data, null, 2),
          fields: [
            {
              title: 'Error',
              value: e.message,
              short: false,
            },
            {
              title: 'Stack',
              value: e.stack,
              short: false,
            },
          ],
        },
      ],
    }

    logger.info('logError - calling chat.postMessage - sending the error to the support channel')
    // then try to send the error to the support channel
    try {
      await boltApp.client.chat.postMessage(postMessageInput)
    } catch (err) {
      logger.error(`logError - failed to call chat.postMessage. error: ${err} | input: ${JSON.stringify(postMessageInput)}`)
    }
  } catch (err) {
    logger.error(`logError - failed to call users.info for userId: ${userId} | error: ${err}`)
  }
}

export function logOrder(order) {
  return {
    items: Array.from(order.items.values()),
    country: order.country,
    office: order.office,
  }
}
