import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run} from 'yacol'
import {connect, listen} from './slack'
import logger from 'winston'

logger.cli()
logger.level = c.logLevel
logger.setLevels(logger.config.npm.levels)

const app = express()
app.use(bodyParser.urlencoded())

const {register, runApp} = expressHelpers

let slackEvents

/* eslint-disable require-await */
function* actions(req, res) {
  slackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

const r = {
  actions: '/actions',
}

register(app, 'post', r.actions, actions)

;(async function() {
  run(runApp)
  app.listen(c.port, () =>
    logger.log('info', `App started on localhost:${c.port}.`)
  )

  slackEvents = await connect(c.slack.botToken)
  await listen(slackEvents)
})().catch((e) => {
  logger.log('error', e)
  process.exit(1)
})
