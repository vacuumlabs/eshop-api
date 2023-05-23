import c from '../config'
import {sheets} from './constants'
import {batchUpdateValues, getFieldIndexMap, getValues} from './sheets.js'
import {getColumn} from './utils'

export async function updateItems(variant, spreadsheetId, isCompanyItem, items, getItemData) {
  const sheet = isCompanyItem ? sheets[variant].companyOrders : sheets[variant].personalOrders

  const [fieldIndexMap, itemIdsFromSheet] = await Promise.all([
    getFieldIndexMap(spreadsheetId, sheet.name, sheet.fieldsRow),
    getValues(spreadsheetId, sheet.idRange),
  ])

  const idToRowsMap = {}

  itemIdsFromSheet.forEach(([itemId], index) => {
    if (itemId) {
      if (!idToRowsMap[itemId]) {
        idToRowsMap[itemId] = []
      }

      idToRowsMap[itemId].push(index + sheet.rowOffset + 1)
    }
  })

  const data = items.reduce((result, item) => {
    const sheetItemId = `${item.id}${c.google.orderIdSuffix}`

    if (!idToRowsMap[sheetItemId]) {
      throw new Error(`Item ID ${sheetItemId} not found in sheet`)
    }

    const rowIndexes = idToRowsMap[sheetItemId]

    const itemData = getItemData(item)

    if (!itemData) {
      return result
    }

    Object.entries(itemData).forEach(([field, value]) => {
      const fieldIndex = fieldIndexMap[field]

      if (!fieldIndex) {
        throw new Error(`Unknown field "${field}"`)
      }

      rowIndexes.forEach((rowIndex) => {
        result.push({
          range: `${sheet.name}!${getColumn(fieldIndex)}${rowIndex}`,
          values: [[value]],
        })
      })
    })

    return result
  }, [])

  return batchUpdateValues(spreadsheetId, sheet, {data, valueInputOption: 'USER_ENTERED'})
}
