import Airtable from 'airtable'
import c from './config'
import {createChannel} from 'yacol'

const base = new Airtable({apiKey: c.airtable.apiKey}).base(c.airtable.base)

const times = []
const countLimit = 5
const timeLimit = 1000

const pendingRequests = createChannel()

function sleep(till) {
  return new Promise((resolve) => setTimeout(resolve(), till - Date.now()))
}

(async function throttleRequests() {
  for (;;) {
    while (times.length >= countLimit) {
      await sleep(times[0] + timeLimit)
      times.shift()
    }

    (await pendingRequests.take())()
    times.push(Date.now())
  }
})()


function waitForRequest() {
  return new Promise((resolve) => pendingRequests.put(resolve))
}

export async function create(table, record) {
  await waitForRequest()
  return await base(table).create(record)
}
