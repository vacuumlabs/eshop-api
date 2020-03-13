import {updateItems} from './updateItems'

export async function addSubsidy(order, items) {
  const getCompanyItemData = (sheetName, rowIndex, item) => {
    return {
      range: `${sheetName}!J${rowIndex}:J${rowIndex}`,
      values: [[item.price]],
    }
  }

  await updateItems(order.isCompany, items, getCompanyItemData)
}
