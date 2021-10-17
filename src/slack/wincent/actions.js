import {NEW_ORDER_STATUS} from '../../sheets/constants'
import {ORDER_TYPE_ACTIONS} from './constants'

export const getOrderActions = () => {
  return ORDER_TYPE_ACTIONS
}

export const getActionsSection = (orderId, primaryBtn, msgButtons) => {
  const buttons = (msgButtons || [
    {name: 'ordered', text: 'Ordered + send notification'},
    {name: 'delivered', text: 'Delivered + send notification'},
  ]).map((btn) => ({
    ...btn,
    type: 'button',
    value: orderId,
    style: primaryBtn === btn.name ? 'primary' : 'default',
  }))

  return {
    text: '*Actions*',
    actions: buttons,
    callback_id: `O${orderId}`,
  }
}

export const getNewOrderAdminSections = (orderAttachment, orderId) => {
  return [
    orderAttachment,
    {
      text: `*Status*\n${NEW_ORDER_STATUS}`,
    },
    {
      text: '*Actions*',
      callback_id: `O${orderId}`,
      actions: [
        {name: 'accepted', text: 'Accept + send notification', type: 'button', value: orderId, style: 'primary'},
        {name: 'decline', text: 'Decline + send notification', type: 'button', value: orderId, style: 'default'},
        {name: 'discard', text: 'Discard', type: 'button', value: orderId, style: 'danger'},
      ],
    },
  ]
}
