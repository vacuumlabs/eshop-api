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
  return makeApiCall('chat.postMessage', {
    channel: c.supportChannel,
    attachments: [
      {
        pretext: `@${userId}: ${msg}`,
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
  })
    .then((data) => {
      try {
        const resp = JSON.parse(data)

        if (resp.error) {
          logger.error('logError', resp.error)
        }
      } catch (err) {
        logger.error('logError', err)
      }
    }).catch((err) => {
      logger.error('logError', err)
    })
}

export function logOrder(order) {
  return {
    items: Array.from(order.items.values()),
    country: order.country,
    office: order.office,
  }
}
