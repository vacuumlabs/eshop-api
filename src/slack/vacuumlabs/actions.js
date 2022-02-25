import {NEW_ORDER_STATUS} from '../../sheets/constants'
import {USER_STEP_MAP} from './constants'

export const getOrderActions = (order) => {
  return USER_STEP_MAP[order.step]
}

export const getActionsSection = (orderId, primaryBtn, msgButtons) => {
  const buttons = (msgButtons || [
    // {name: 'add-to-cart', text: 'Add to Cart'},
    {name: 'ordered', text: 'Ordered + send notification'},
    {name: 'delivered', text: 'Delivered + send notification'},
  ]).map((btn) => ({
    ...btn,
    type: 'button',
    value: orderId,
    style: btn.name === primaryBtn ? 'primary' : btn.name === 'discard' ? 'danger' : 'default',
  }))

  return {
    text: '',
    actions: buttons,
    callback_id: `O${orderId}`,
  }
}

export const getNewOrderAdminSections = (orderAttachment, orderId, orderOffice) => {
  // not sure if possible at all
  // maybe the message shouldn't even get sent when order.office is missing
  const forwardAction = orderOffice ? [{name: 'forward-to-channel', text: `Forward to ${orderOffice}`, type: 'button', value: orderId, style: 'primary'}] : []

  return [
    orderAttachment,
    {
      text: `*Status:* ${NEW_ORDER_STATUS}`,
    },
    {
      text: '',
      callback_id: `O${orderId}`,
      actions: [
        ...forwardAction,
        {name: 'decline', text: 'Decline + send notification', type: 'button', value: orderId, style: 'default'},
        {name: 'discard', text: 'Discard', type: 'button', value: orderId, style: 'danger'},
      ],
    },
  ]
}
