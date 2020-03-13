import {updateItems} from './updateItems'

export async function updateStatus(order, items, status) {
  const getCompanyItemData = (sheetName, rowIndex) => {
    return {
      range: `${sheetName}!H${rowIndex}:H${rowIndex}`,
      values: [[status]],
    }
  }

  const getPersonalItemData = (sheetName, rowIndex) => {
    return {
      range: `${sheetName}!E${rowIndex}:E${rowIndex}`,
      values: [[status]],
    }
  }

  await updateItems(
    order.isCompany,
    items,
    getCompanyItemData,
    getPersonalItemData,
  )
}