import {updateItems} from './updateItems'

export function updateStatus(variant, spreadsheetId, order, items, status) {
  return updateItems(
    variant,
    spreadsheetId,
    order.isCompany,
    items,
    (item) => ({Status: status}),
  )
}
