import * as vlActions from './vacuumlabs/actions'
import * as testActions from './test/actions'
import * as wincentActions from './wincent/actions'

const variantMap = {
  vacuumlabs: vlActions,
  test: testActions,
  wincent: wincentActions,
}

// user-facing actions
export const getUserActions = (variant, order) => {
  return variantMap[variant].getOrderActions(order) || {}
}

// admin-facing sections
const getStatusSection = (orderId) => ({
  text: '',
  actions: [
    {
      type: 'select',
      name: 'status',
      text: 'Set status...',
      options: ['requested', 'ordered', 'canceled', 'delivered', 'lost', 'sold', 'used', 'gift'].map((status) => ({
        text: status,
        value: status,
      })),
    },
  ],
  callback_id: `O${orderId}`,
})

export const getArchiveSection = (orderId, toArchive) => ({
  text: '',
  actions: [
    {
      type: 'button',
      name: toArchive ? 'unarchive' : 'archive',
      text: toArchive ? 'Unarchive' : 'Archive',
      value: orderId,
      style: 'default',
    },
  ],
  callback_id: `O${orderId}`,
})

export const getAdminSections = (variant, orderId, primaryBtn, msgButtons) => {
  const variantMap = {
    vacuumlabs: vlActions.getActionsSection,
    test: testActions.getActionsSection,
    wincent: wincentActions.getActionsSection,
  }
  const getActionsSection = variantMap[variant]

  return [
    getStatusSection(orderId),
    getActionsSection(orderId, primaryBtn, msgButtons),
    getArchiveSection(orderId, false),
  ]
}

export const getNewOrderAdminSections = (variant, orderAttachment, orderId, orderOffice) => {
  return variantMap[variant].getNewOrderAdminSections(orderAttachment, orderId, orderOffice)
}
