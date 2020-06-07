import c from '../config.js'
import {google} from 'googleapis'

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

export async function getFieldIndexMap(sheetName, fieldsRow) {
  const [values] = await getValues(`${sheetName}!A${fieldsRow}:ZZ`)

  return values.reduce((acc, value, index) => {
    if (value && !acc[value]) {
      acc[value] = index + 1
    }

    return acc
  }, {})
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
  await sheetsApi.spreadsheets.values.batchUpdate({
    spreadsheetId: c.google.spreadsheetId,
    requestBody: requests,
  })
}
