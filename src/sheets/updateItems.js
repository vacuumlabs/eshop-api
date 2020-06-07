import logger from '../logger'
import {getFieldIndexMap, getValues, batchUpdateValues, batchGetValues} from './sheets.js'
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

  await batchUpdateValues(sheet, {data, valueInputOption: 'USER_ENTERED'})

  const expectedValues = data.reduce((acc, data) => {
    acc[data.range] = data.values
    return acc
  }, {})

  const realValues = await batchGetValues(Object.keys(expectedValues))

  const realValuesMap = realValues.reduce((acc, data) => {
    acc[data.range] = data.values
    return acc
  }, {})

  const updateValid = Object.entries(expectedValues).every(
    ([key, value]) =>
      realValuesMap[key] &&
      JSON.stringify(value) === JSON.stringify(realValuesMap[key]),
  )

  if (!updateValid) {
    logger.log('error', 'Updated values overwritten')
    throw new Error('Updated values overwritten')
  }
}
