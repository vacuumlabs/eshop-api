import logger from '../logger'
import {getValues, batchUpdateValues, batchGetValues} from './sheets.js'
import {sheets} from './constants'

export async function updateItems(
  isCompanyItem,
  items,
  getCompanyItemData = () => null,
  getPersonalItemData = () => null,
) {
  const sheet = isCompanyItem ? sheets.companyOrders : sheets.personalOrders

  const itemsMap = new Map(items.map((item) => [item.id, item]))

  const itemIdsFromSheet = await getValues(sheet.idRange)

  const data = itemIdsFromSheet.reduce((result, itemId, index) => {
    if (itemsMap.has(itemId[0])) {
      const rowIndex = index + sheet.rowOffset + 1

      const itemData = isCompanyItem
        ? getCompanyItemData(sheet.name, rowIndex, itemsMap.get(itemId[0]))
        : getPersonalItemData(sheet.name, rowIndex, itemsMap.get(itemId[0]))

      if (itemData) {
        result.push(itemData)
      }
    }
    return result
  }, [])

  if (data.length === 0) {
    logger.log('error', 'Item not found in sheet')
    throw new Error('Item not found in sheet')
  }

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
