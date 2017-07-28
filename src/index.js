import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run} from 'yacol'
import {connect, listen} from './slack'

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
    /* eslint-disable no-console */
    console.log(`App started on localhost:${c.port}.`)
    /* eslint-enable no-console */
  )

  slackEvents = await connect(c.slack.botToken)
  await listen(slackEvents)
})().catch((e) => {
  /* eslint-disable no-console */
  console.log(e)
  /* eslint-enable no-console */
  process.exit(1)
})
