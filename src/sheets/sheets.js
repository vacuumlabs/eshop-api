import c from '../config.js'
import {google} from 'googleapis'
import {sleep} from './utils.js'
import logger from '../logger.js'

const scopes = ['https://www.googleapis.com/auth/spreadsheets']
const key = Buffer.from(c.google.key, 'base64').toString()
const auth = new google.auth.JWT(c.google.email, null, key, scopes)
const sheetsApi = google.sheets({version: 'v4', auth})

export async function getValues(range) {
  return (
    (
      await sheetsApi.spreadsheets.values.get({
        spreadsheetId: c.google.spreadsheetId,
        valueRenderOption: 'UNFORMATTED_VALUE',
        range,
      })
    ).data.values || []
  )
}

export async function batchGetValues(ranges) {
  return (
    (
      await sheetsApi.spreadsheets.values.batchGet({
        spreadsheetId: c.google.spreadsheetId,
        valueRenderOption: 'UNFORMATTED_VALUE',
        ranges,
      })
    ).data.valueRanges || []
  )
}

export function appendRows(sheetName, values) {
  return sheetsApi.spreadsheets.values.append({
    spreadsheetId: c.google.spreadsheetId,
    range: `${sheetName}!A1:A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values,
    },
  })
}

export async function batchUpdateValues(sheet, requests) {
  await withLock(sheet, async () => {
    return (
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId: c.google.spreadsheetId,
        requestBody: requests,
      })
    ).data.replies
  })
}

async function batchUpdate(requests) {
  return (
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: c.google.spreadsheetId,
      resource: {requests},
    })
  ).data.replies
}

async function getAllLockIds() {
  return (
    await sheetsApi.spreadsheets.get({
      spreadsheetId: c.google.spreadsheetId,
    })
  ).data.sheets
    .filter((s) => s.protectedRanges)
    .map((s) => s.protectedRanges.map((r) => r.protectedRangeId))
    .flat()
}

async function removeAllLocks() {
  const protectedRangeIds = await getAllLockIds()
  const requests = protectedRangeIds.map((id) => {
    return {
      deleteProtectedRange: {
        protectedRangeId: id,
      },
    }
  })

  await batchUpdate(requests)
}

async function tryLockSheet(sheetId) {
  let error
  const updateResult = await batchUpdate([
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
          },
          description: 'AlzaBot lock',
          warningOnly: false,
          editors: {
            users: [c.google.email],
            groups: [],
            domainUsersCanEdit: false,
          },
        },
      },
    },
  ]).catch((reason) => {
    error = reason
  })

  // traditional try catch didn't work here
  if (error) {
    return null
  }

  const protectedRangeId =
    updateResult[0].addProtectedRange.protectedRange.protectedRangeId

  return async () =>
    await batchUpdate([
      {
        deleteProtectedRange: {protectedRangeId},
      },
    ])
}

class SheetLockTimeout extends Error {
  constructor(sheet) {
    super('Could not acquire lock on sheet')
    this.sheet = sheet
  }
}

async function withLock({id, name}, fn) {
  const timeouts = [0.5, 1, 2, 4, 8]

  const tryLocking = async () => {
    let unlock = null
    for (const timeout of timeouts) {
      unlock = await tryLockSheet(id)
      if (unlock) break
      logger.log('error', `Lock failed. Sleeping for ${timeout}`)
      await sleep(timeout * 1000)
    }

    return unlock
  }

  let unlock = await tryLocking()
  if (!unlock) {
    logger.log('info', 'Removing locks')
    await removeAllLocks()
    logger.log('info', 'Locks removed')
    unlock = await tryLocking()
    if (!unlock) {
      throw new SheetLockTimeout(name)
    }
  }

  try {
    return await fn()
  } finally {
    await unlock()
  }
}
