import {getFieldIndexMap, getValues, markCells} from './sheets'
import {sheets} from './constants'
import c from '../config'

export async function addSubsidy(variant, spreadsheetId, order, items) {
  const sheet = order.isCompany ? sheets[variant].companyOrders : sheets[variant].personalOrders

  const [fieldIndexMap, itemIdsFromSheet] = await Promise.all([
    getFieldIndexMap(spreadsheetId, sheet.name, sheet.fieldsRow),
    getValues(spreadsheetId, sheet.idRange),
  ])

  if (!fieldIndexMap.Subsidy) {
    throw new Error('Order cannot be marked as subsidy')
  }

  const colIndex = fieldIndexMap.Subsidy - 1

  const idToRowsMap = {}

  itemIdsFromSheet.forEach(([itemId], index) => {
    if (itemId) {
      if (!idToRowsMap[itemId]) {
        idToRowsMap[itemId] = []
      }

      idToRowsMap[itemId].push(index + sheet.rowOffset)
    }
  })

  const destinations = items.reduce((result, item) => {
    const sheetItemId = `${item.id}${c.google.orderIdSuffix}`

    if (itemIdsFromSheet[sheetItemId]) {
      throw new Error('Item not found in sheet')
    }

    const rowIndexes = idToRowsMap[sheetItemId]

    rowIndexes.forEach((rowIndex) => {
      result.push({
        sheetId: sheet.id,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex: colIndex,
        endColumnIndex: colIndex + 1,
      })
    })

    return result
  }, [])

  return markCells(variant, spreadsheetId, destinations)
}
