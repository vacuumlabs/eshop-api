import {getValues, batchGetValues, batchUpdateValues} from './sheets.js'
import {formatAsHyperlink, formatDate} from './utils'
import {sheets} from './constants'

export async function storeOrder(order, items) {
  const sheet = order.isCompany ? sheets.companyOrders : sheets.personalOrders

  const newRowIndex = await getNextEmptyRowIndex(sheet)

  const user = order.user
  const userJiraId = await getUserJiraId(user.id, user.name)

  const date = new Date()

  const itemToSheetData = order.isCompany
    ? mapCompanyOrderItemToSheetData
    : mapPersonalOrderItemToSheetData

  const data = items.map((item, index) => {
    return itemToSheetData(
      item,
      newRowIndex + index,
      order,
      sheet.name,
      userJiraId,
      date,
    )
  })

  await batchUpdateValues(sheet, {data, valueInputOption: 'USER_ENTERED'})
}

async function getNextEmptyRowIndex(sheet) {
  const values = await getValues(sheet.idRange)
  let firstEmpty = values.findIndex((v) => v.every((c) => !c))

  if (firstEmpty === -1) {
    firstEmpty = values.length
  }

  return firstEmpty + sheet.rowOffset + 1
}

async function getUserJiraId(slackId, name) {
  const sheetData = await batchGetValues([
    sheets.settings.jiraIdRange,
    sheets.settings.slackIdRange,
  ])
  const values = sheetData.map((vr) => vr.values)

  const jiraIds = values[0]
  const slackIds = values[1]
  const rowIndex = slackIds.findIndex((i) => {
    return i.length === 1 && i[0] === slackId
  })

  if (rowIndex === -1) {
    return `${name}:${slackId}`
  }

  return jiraIds[rowIndex][0]
}

function mapPersonalOrderItemToSheetData(
  item,
  rowIndex,
  order,
  sheetName,
  userJiraId,
  date,
) {
  return [
    {
      range: `${sheetName}!A${rowIndex}:L${rowIndex}`,
      values: [
        [
          item.dbId,
          formatAsHyperlink(item.url, item.name),
          item.price,
          null,
          order.office,
          'requested',
          null,
          null,
          null,
          userJiraId,
          null,
          formatDate(date),
        ],
      ],
    },
  ]
}

function mapCompanyOrderItemToSheetData(
  item,
  rowIndex,
  order,
  sheetName,
  userJiraId,
  date,
) {
  return [
    {
      range: `${sheetName}!A${rowIndex}:N${rowIndex}`,
      values: [
        [
          item.dbId,
          formatAsHyperlink(item.url, item.name),
          item.price,
          null,
          null,
          order.office,
          order.reason,
          'requested',
          null,
          null,
          null,
          userJiraId,
          null,
          formatDate(date),
        ],
      ],
    },
  ]
}
