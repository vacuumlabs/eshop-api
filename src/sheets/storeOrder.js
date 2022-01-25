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

  const data = []

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex]

    for (let i = 0; i < item.count; i++) {
      data.push(
        mapFieldsToRow(
          fieldIndexMap,
          itemToSheetData(
            variant,
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

function itemToSheetData(
  variant,
  dbId,
  item,
  order,
  userJiraId,
  date,
) {
  const commonFields = {
    Status: NEW_ORDER_STATUS,
    Date: formatDate(date),
  }
  const variantFields = variant === 'wincent' ? {
    ID: dbId,
    Specification: formatAsHyperlink(item.url, item.name),
  } : {
    UUID: dbId,
    Name: formatAsHyperlink(item.url, item.name),
    Office: order.office,
  }
  const companyOrPersonalFields = order.isCompany ? {
    'Reason': order.reason,
    'Requested by': userJiraId,
    'Spinoff': order.spinoff,
  } : {
    'Note': order.reason,
    'Urgent': Boolean(order.isUrgent),
    'User ID': userJiraId,
  }

  return {
    ...commonFields,
    ...variantFields,
    ...companyOrPersonalFields,
  }
}
