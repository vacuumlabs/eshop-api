import {updateItems} from './updateItems'

export function addSubsidy(order, items) {
  return updateItems(order.isCompany, items, (item) => ({Subsidy: item.price}))
}
