import {getFieldIndexMap, getValues, batchUpdateValues} from './sheets.js'
import {getColumn} from './utils'
import {sheets} from './constants'

export async function updateItems(
  isCompanyItem,
  items,
  getItemData,
) {
  const sheet = isCompanyItem ? sheets.companyOrders : sheets.personalOrders

  const [fieldIndexMap, itemIdsFromSheet] = await Promise.all([
    getFieldIndexMap(sheet.name, sheet.fieldsRow),
    getValues(sheet.idRange),
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
    if (itemIdsFromSheet[item.id]) {
      throw new Error('Item not found in sheet')
    }

    const rowIndexes = itemIdsFromSheet[item.id]

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

  return batchUpdateValues(sheet, {data, valueInputOption: 'USER_ENTERED'})
}
