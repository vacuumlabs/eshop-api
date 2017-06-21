import airtable from 'airtable'
import c from './config'
import {run, createChannel} from 'yacol'

const base = new airtable({apiKey: c.airtable.apiKey}).base(c.airtable.base)

const times = []
const countLimit = 5
const timeLimit = 1000

const pendingRequests = createChannel()

function sleep(till) {
  return new Promise((resolve) => setTimeout(resolve(), till - Date.now()))
}

run(function* throttleRequests() {
  for (;;) {
    while (times.length >= countLimit) {
      yield sleep(times[0] + timeLimit)
      times.shift()
    }

    (yield pendingRequests.take())()
    times.push(Date.now())
  }
})


function waitForRequest() {
  return new Promise((resolve) => pendingRequests.put(resolve))
}

export function* create(table, record) {
  yield waitForRequest()
  return yield base(table).create(record)
}
