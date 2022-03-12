import {NEW_ORDER_STATUS} from '../../sheets/constants'
import {USER_STEP_MAP} from './constants'

export const getOrderActions = (order) => {
  return USER_STEP_MAP[order.step]
}

export const getActionsSection = (orderId, primaryBtn, msgButtons) => {
  const buttons = (
    msgButtons || [
      {name: 'ordered', text: 'Ordered + send notification'},
      {name: 'delivered', text: 'Delivered + send notification'},
    ]
  ).map((btn) => ({
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

export const getNewOrderAdminSections = (orderAttachment, orderId) => {
  return [
    orderAttachment,
    {
      text: `*Status:* ${NEW_ORDER_STATUS}`,
    },
    {
      text: '',
      callback_id: `O${orderId}`,
      actions: [
        {name: 'accepted', text: 'Accept + send notification', type: 'button', value: orderId, style: 'primary'},
        {name: 'decline', text: 'Decline + send notification', type: 'button', value: orderId, style: 'default'},
        {name: 'discard', text: 'Discard', type: 'button', value: orderId, style: 'danger'},
      ],
    },
  ]
}
