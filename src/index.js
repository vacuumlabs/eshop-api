import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run, createChannel} from 'yacol'
import {init} from './slack'
import {alzaCode} from './alza'
import logger from 'winston'

logger.cli()
logger.level = c.logLevel
logger.setLevels(logger.config.npm.levels)

const app = express()
app.use(bodyParser.urlencoded())

const {register, runApp} = expressHelpers

const slackEvents = createChannel()

// eslint-disable-next-line require-yield
function* actions(req, res) {
  slackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

const r = {
  actions: '/actions',
  alzaCode: '/alzacode',
}

register(app, 'post', r.actions, actions)
register(app, 'get', r.alzaCode, alzaCode)

;(async function() {
  run(runApp)
  app.listen(c.port, () =>
    logger.log('info', `App started on localhost:${c.port}.`)
  )

  await init(c.slack.botToken, slackEvents)
})().catch((e) => {
  logger.log('error', e)
  process.exit(1)
})
