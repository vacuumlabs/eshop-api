import airtable from 'airtable'
import c from './config'
import {run} from 'yacol'

const base = new airtable({apiKey: c.airtable.apiKey}).base(c.airtable.base)

const times = []
const countLimit = 5
const timeLimit = 1000

function sleep(till) {
  return new Promise((resolve) => setTimeout(resolve(value), till - Date.now()))
}

function* waitForRequest() {
  while (times.length >= countLimit) {
    yield sleep(times[0] + timeLimit)
    times.shift()
  }

  times.push(Date.now())
}

export function* create(table, record) {
  yield run(waitForRequest)
  return yield base(table).create(record)
}
