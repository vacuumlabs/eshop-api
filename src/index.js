import express from 'express'
import {expressHelpers, run, createChannel} from 'yacol'

import c from './config'
import {Slack} from './slack/slack'
import {alzaCode} from './alza'
import logger from './logger'

const app = express()
app.use(express.urlencoded())

const {register, runApp} = expressHelpers

const events = {
  vacuumlabs: createChannel(),
  test: createChannel(),
  wincent: createChannel(),
}

// eslint-disable-next-line require-yield
function* vacuumlabsActions(req, res) {
  events.vacuumlabs.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}
// eslint-disable-next-line require-yield
function* testActions(req, res) {
  events.test.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}
// eslint-disable-next-line require-yield
function* wincentActions(req, res) {
  events.wincent.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

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

register(app, 'get', endpoints.alzaCode, alzaCode)
register(app, 'post', endpoints.vacuumlabs.actions, vacuumlabsActions)
register(app, 'post', endpoints.test.actions, testActions)
register(app, 'post', endpoints.wincent.actions, wincentActions)

;(async function() {
  run(runApp)

  app.listen(c.port, () =>
    logger.info(`App started on localhost:${c.port}.`)
  )

  await Promise.all(['vacuumlabs', 'test', 'wincent'].map(async (variant) => {
    if (!c[variant]) {
      logger.warn(`Config for variant ${variant} not defined, the variant will not run.`)
      return
    }
    const slackClient = new Slack(variant)

    app.use(endpoints[variant].events, slackClient.boltReceiver.router)

    await slackClient.init(events[variant])
  }))
})().catch((e) => {
  logger.error('Init error', e)
  process.exit(1)
})
