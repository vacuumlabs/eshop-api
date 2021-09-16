import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run, createChannel} from 'yacol'
import {init} from './slack'
import {alzaCode} from './alza'
import logger from './logger'

const app = express()
app.use(bodyParser.urlencoded())

const {register, runApp} = expressHelpers

const slackEvents = createChannel()
const testSlackEvents = createChannel()
const wincentSlackEvents = createChannel()

// eslint-disable-next-line require-yield
function* vacuumlabsActions(req, res) {
  slackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}
// eslint-disable-next-line require-yield
function* testActions(req, res) {
  testSlackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}
// eslint-disable-next-line require-yield
function* wincentActions(req, res) {
  wincentSlackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

const r = {
  actions: '/actions',
  alzaCode: '/alzacode',
  vacuumlabs: {
    actions: '/vacuumlabs/actions',
  },
  test: {
    actions: '/test/actions',
  },
  wincent: {
    actions: '/wincent/actions',
  },
}

register(app, 'post', r.actions, vacuumlabsActions)
register(app, 'get', r.alzaCode, alzaCode)
register(app, 'post', r.vacuumlabs.actions, vacuumlabsActions)
register(app, 'post', r.test.actions, testActions)
register(app, 'post', r.wincent.actions, wincentActions)

;(async function() {
  run(runApp)
  app.listen(c.port, () =>
    logger.log('info', `App started on localhost:${c.port}.`)
  )

  await init(c.vacuumlabs.slack.botToken, slackEvents)
  // await init(c.test.slack.botToken, testSlackEvents)
  // await init(c.wincent.slack.botToken, wincentSlackEvents)
})().catch((e) => {
  logger.log('error', 'Init error', e)
  process.exit(1)
})
