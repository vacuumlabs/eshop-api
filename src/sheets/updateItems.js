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

  const idToRowMap = new Map(
    itemIdsFromSheet
      .map(([itemId], index) => itemId && [itemId, index + sheet.rowOffset + 1])
      .filter(Boolean),
  )

  const data = items.reduce((result, item) => {
    if (!idToRowMap.has(item.id)) {
      throw new Error('Item not found in sheet')
    }

    const rowIndex = idToRowMap.get(item.id)

    const itemData = getItemData(item)

    if (!itemData) {
      return result
    }

    Object.entries(itemData).forEach(([field, value]) => {
      const fieldIndex = fieldIndexMap[field]

      if (!fieldIndex) {
        throw new Error(`Unknown field "${field}"`)
      }

      result.push({
        range: `${sheet.name}!${getColumn(fieldIndex)}${rowIndex}`,
        values: [[value]],
      })
    })

    return result
  }, [])

  return batchUpdateValues(sheet, {data, valueInputOption: 'USER_ENTERED'})
}
