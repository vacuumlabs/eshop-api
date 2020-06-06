import {updateItems} from './updateItems'

export async function addSubsidy(order, items) {
  const getCompanyItemData = (sheetName, rowIndex, item) => {
    return {
      range: `${sheetName}!K${rowIndex}:K${rowIndex}`,
      values: [[item.price]],
    }
  }

  await updateItems(order.isCompany, items, getCompanyItemData)
}
