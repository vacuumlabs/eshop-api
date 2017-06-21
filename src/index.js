import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run} from 'yacol'
import {connect, listen} from './slack'

const app = express()
app.use(bodyParser.urlencoded())

const {register, runApp} = expressHelpers

let slackEvents

/* eslint-disable require-yield */
function* actions(req, res) {
  slackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

const r = {
  actions: '/actions',
}

register(app, 'post', r.actions, actions)

run(function* () {
  run(runApp)
  app.listen(c.port, () =>
    /* eslint-disable no-console */
    console.log(`App started on localhost:${c.port}.`)
    /* eslint-enable no-console */
  )

  slackEvents = yield run(connect, c.slack.botToken)
  yield run(listen, slackEvents)
}).catch((e) => {
  /* eslint-disable no-console */
  console.log(e)
  /* eslint-enable no-console */
  process.exit(1)
})
