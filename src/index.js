import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run} from 'yacol'
import {login, addToCart, getInfo} from './alza'
import {connect, listen} from './slack'

const app = express()
app.use(bodyParser.urlencoded())

const {register, runApp} = expressHelpers

let slackEvents

function* orderItems(items) {
  let info = []
  let totalPrice = 0
  yield run(login, c.alza.credentials)
  for (let item of items) {
    yield run(addToCart, item)
    const itemInfo = yield run(getInfo, item.url)
    info.push(itemInfo)
    totalPrice += itemInfo.price * item.count
  }
  return {items: info, totalPrice}
}

function* index(req, res) {
  const info = yield run(orderItems, [
    {url: 'https://www.alza.sk/rowenta-rh8895wo-airforce-extreme-32-4v-d4945936.htm', count: 3},
    {url: 'https://www.alza.sk/asus-gt1030-sl-2g-brk-d4943984.htm', count: 12},
    {url: 'https://www.alza.sk/samsung-galaxy-a3-2016-sm-a310f?dq=3955169', count: 1},
  ])
  console.log(info)
  res.send('Hello World')
}

function* actions(req, res) {
  slackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

const r = {
  index: '/',
  actions: '/actions',
}

register(app, 'get', r.index, index)
register(app, 'post', r.actions, actions)

run(function* () {
  run(runApp)
  app.listen(c.port, () =>
    console.log(`App started on localhost:${c.port}.`)
  )

  slackEvents = yield run(connect, c.slack.botToken)
  yield run(listen, slackEvents)
})
