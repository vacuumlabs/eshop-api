import winston from 'winston'
import c from './config'
import {makeApiCall} from './slackApi'

const logger = winston.createLogger({
  level: c.logLevel,
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
})

export default logger

export function logError(e, msg, userId, data) {
  logger.error(`logError. error: ${e} | msg: ${msg} | userId: ${userId} | data: ${JSON.stringify(data)}`)

  logger.info(`calling users.info for userId: ${userId}`)
  // first try to get username from user's ID
  return makeApiCall('users.info', {user: userId}).then((userData) => {
    logger.info(`parsing response from users.info for userId: ${userId}`)

    let username = ''
    try {
      const resp = JSON.parse(userData)
      if (resp.error) {
        logger.error(`logError - error field in response from users.info. resp.error: ${resp.error}`)
      } else {
        username = resp.user.name
      }
    } catch (err) {
      logger.error(`logError - failed to parse response from users.info. error: ${err}`)
    }

    const postMessageInput = {
      channel: c.vacuumlabs.channels.support,
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
    return makeApiCall('chat.postMessage', postMessageInput)
      .then((data) => {
        logger.info('logError - parsing response from chat.postMessage')
        try {
          const resp = JSON.parse(data)

          if (resp.error) {
            logger.error(`logError - error field in response from chat.postMessage. resp.error: ${resp.error} | input: ${JSON.stringify(postMessageInput)}`)
          }
        } catch (err) {
          logger.error(`logError - failed to parse response from chat.postMessage. error: ${err} | response: ${data}`)
        }
      }).catch((err) => {
        logger.error(`logError - failed to call chat.postMessage. error: ${err} | input: ${JSON.stringify(postMessageInput)}`)
      })
  })
    .catch((err) => {
      logger.error(`logError - failed to call users.info for userId: ${userId} | error: ${err}`)
    })
}

export function logOrder(order) {
  return {
    items: Array.from(order.items.values()),
    country: order.country,
    office: order.office,
  }
}
