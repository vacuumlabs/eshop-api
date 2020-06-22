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
  makeApiCall('chat.postMessage', {
    channel: c.supportChannel,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'plain_text',
          text: `<@channel> <@${userId}>: ${msg}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'plain_text',
          text: JSON.stringify(data, null, 2),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: `${e.message} at ${e.stack}`,
          },
        ],
      },
    ],
  })
}

export function logOrder(order) {
  return {
    items: Array.from(order.items.values()),
    country: order.country,
    office: order.office,
  }
}
