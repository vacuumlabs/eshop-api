import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run, createChannel} from 'yacol'
import {init} from './slack'
import logger from 'winston'
import {login} from './alza'

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
}

register(app, 'post', r.actions, actions)

app.get('/login', (req, res) => {
  const data = {...c.alza.credentials}

  if (req.query.code) {
    data.validationCode = req.query.code
  }

  login(data).then(resp => {
    console.log(resp)
    res.send(resp)
  })
})

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
