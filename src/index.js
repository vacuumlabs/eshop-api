import express from 'express'

import c from './config'
import logger from './logger'
import {Slack} from './slack/slack'

const app = express()

const endpoints = {
  alzaCode: '/alzacode',
  vacuumlabs: {
    actions: '/vacuumlabs/actions',
    events: '/vacuumlabs/events',
  },
  test: {
    actions: '/test/actions',
    events: '/test/events',
  },
  wincent: {
    actions: '/wincent/actions',
    events: '/wincent/events',
  },
}

;(async function () {
  app.listen(c.port, () => logger.info(`App started on localhost:${c.port}.`))

  await Promise.all(
    ['vacuumlabs', 'test', 'wincent'].map(async (variant) => {
      if (!c[variant]) {
        logger.warn(`Config for variant ${variant} not defined, the variant will not run.`)
        return
      }
      const slackClient = new Slack(variant)

      app.use(endpoints[variant].actions, slackClient.boltReceiver.router)
      app.use(endpoints[variant].events, slackClient.boltReceiver.router)

      await slackClient.init()
    }),
  )
})().catch((e) => {
  logger.error('Init error', e)
  process.exit(1)
})
