import c from './config'
import express from 'express'
import {expressHelpers, run} from 'yacol'

const app = express()
const {register, runApp} = expressHelpers

function* index(req, res) {
  res.send('Hello World')
}

const r = {
  index: '/',
}

register(app, 'get', r.index, index)

run(function* () {
  const a = run(runApp)
  app.listen(c.port, () =>
    console.log(`App started on localhost:${c.port}.`)
  )
  yield a
})
