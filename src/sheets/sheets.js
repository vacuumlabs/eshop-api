import c from '../config.js'
import {google} from 'googleapis'

const scopes = ['https://www.googleapis.com/auth/spreadsheets']
const key = Buffer.from(c.google.key, 'base64').toString()
const auth = new google.auth.JWT(c.google.email, null, key, scopes)
const sheetsApi = google.sheets({version: 'v4', auth})

async function tryCall(call) {
  try {
    return await call()
  } catch (err) {
    throw new Error(`Google API error: ${err.errors.map((e) => e.message).join(', ')}`)
  }
}

export async function getValues(spreadsheetId, range) {
  return (
    (await tryCall(
      () => sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        valueRenderOption: 'UNFORMATTED_VALUE',
        range,
      })
    )).data.values || []
  )
}

export async function getFieldIndexMap(spreadsheetId, sheetName, fieldsRow) {
  const [values] = await getValues(spreadsheetId, `${sheetName}!A${fieldsRow}:ZZ`)

  return values.reduce((acc, value, index) => {
    if (value && !acc[value]) {
      acc[value] = index + 1
    }

    return acc
  }, {})
}

export async function batchGetValues(spreadsheetId, ranges) {
  return (
    (await tryCall(
      () => sheetsApi.spreadsheets.values.batchGet({
        spreadsheetId,
        valueRenderOption: 'UNFORMATTED_VALUE',
        ranges,
      })
    )).data.valueRanges || []
  )
}

export function appendRows(spreadsheetId, sheetName, values) {
  return tryCall(() => sheetsApi.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1:A1`,
    insertDataOption: 'INSERT_ROWS',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values,
    },
  }))
}

export function batchUpdateValues(spreadsheetId, sheet, requests) {
  return tryCall(() => sheetsApi.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: requests,
  }))
}
