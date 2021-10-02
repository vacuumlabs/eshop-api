import {getFieldIndexMap, batchGetValues, appendRows} from './sheets.js'
import {formatAsHyperlink, formatDate, mapFieldsToRow} from './utils'
import {sheets, NEW_ORDER_STATUS} from './constants'
import c from '../config'

export async function storeOrder(variant, spreadsheetId, order, items) {
  const sheet = order.isCompany ? sheets[variant].companyOrders : sheets[variant].personalOrders

  const fieldIndexMap = await getFieldIndexMap(spreadsheetId, sheet.name, sheet.fieldsRow)

  const user = order.user
  const userJiraId = await getUserJiraId(variant, spreadsheetId, user.id, user.name)

  const date = new Date()

  const itemToSheetData = order.isCompany
    ? mapCompanyOrderItemToSheetData
    : mapPersonalOrderItemToSheetData

  const data = []

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex]

    for (let i = 0; i < item.count; i++) {
      data.push(
        mapFieldsToRow(
          fieldIndexMap,
          itemToSheetData(
            `${item.dbIds[i]}${c.google.orderIdSuffix}`,
            item,
            order,
            userJiraId,
            date,
          ),
        ),
      )
    }
  }

  return appendRows(spreadsheetId, sheet.name, data)
}

async function getUserJiraId(variant, spreadsheetId, slackId, name) {
  const sheetData = await batchGetValues(spreadsheetId, [
    sheets[variant].settings.jiraIdRange,
    sheets[variant].settings.slackIdRange,
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
  dbId,
  item,
  order,
  userJiraId,
  date,
) {
  return {
    'UUID': dbId,
    'Name': formatAsHyperlink(item.url, item.name),
    'Office': order.office,
    'Reason': order.reason,
    'Urgent': Boolean(order.isUrgent),
    'Status': NEW_ORDER_STATUS,
    'User ID': userJiraId,
    'ts': formatDate(date),
  }
}

function mapCompanyOrderItemToSheetData(
  dbId,
  item,
  order,
  userJiraId,
  date,
) {
  return {
    'UUID': dbId,
    'Name': formatAsHyperlink(item.url, item.name),
    'Office': order.office,
    'Reason': order.reason,
    'Status': NEW_ORDER_STATUS,
    'Requested by': userJiraId,
    'ts': formatDate(date),
  }
}
