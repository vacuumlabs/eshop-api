import {updateItems} from './updateItems'

export function updateStatus(order, items, status) {
  return updateItems(
    order.isCompany,
    items,
    (item) => ({Status: status}),
  )
}
