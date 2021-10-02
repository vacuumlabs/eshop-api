import {updateItems} from './updateItems'

export function updateStatus(spreadsheetId, order, items, status) {
  return updateItems(
    spreadsheetId,
    order.isCompany,
    items,
    (item) => ({Status: status}),
  )
}
