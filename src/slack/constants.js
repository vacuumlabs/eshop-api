import * as vlConstants from './vacuumlabs/constants'
import * as testConstants from './test/constants'
import * as wincentConstants from './wincent/constants'

export const MESSAGES = {
  home: {
    company: ':question: Why do you need these items? Reply by sending a message. And don\'t forget to tell us your address!',
    personal: ':pencil: Add a note by sending a message. And don\'t forget to tell us your address!',
  },
  office: {
    company: ':question: Why do you need these items? Reply by sending a message.',
    personal: {
      note: ':pencil: Send your comment in a message.',
    },
  },
  notification: {
    accepted: 'Your order was accepted by office manager. You will be notified when the items get ordered.',
    ordered: 'Your items were ordered. You will be notified when they arrive.',
    delivered: 'Your order has arrived :truck: Come pick it up during office hours. If it was a personal order, please bring the money in CASH.',
  },
}

export const NEW_USER_GREETING = {
  vacuumlabs: vlConstants.NEW_USER_GREETING,
  test: testConstants.NEW_USER_GREETING,
  wincent: wincentConstants.NEW_USER_GREETING,
}

export const SLACK_URL = {
  vacuumlabs: vlConstants.SLACK_URL,
  test: testConstants.SLACK_URL,
  wincent: wincentConstants.SLACK_URL,
}

// TODO: for all other constants, either define it in this file or
//   make it variant-dependent like this one - guide it by wincent needs
// wincent should never access this
export const CITIES_OPTIONS_TO_CITIES = {
  vacuumlabs: vlConstants.CITIES_OPTIONS_TO_CITIES,
  test: testConstants.CITIES_OPTIONS_TO_CITIES,
}

export const OFFICES = vlConstants.OFFICES

export const HOME_VALUE = vlConstants.HOME_VALUE

export const HOME_TO_OFFICE = vlConstants.HOME_TO_OFFICE

export const CANCEL_ORDER_ACTION = vlConstants.CANCEL_ORDER_ACTION

export const ORDER_TYPE_ACTIONS = vlConstants.ORDER_TYPE_ACTIONS

export const ORDER_OFFICE_ACTIONS = vlConstants.ORDER_OFFICE_ACTIONS

export const ORDER_URGENT_ACTIONS = vlConstants.ORDER_URGENT_ACTIONS

export const NOTE_NO_ACTION = vlConstants.NOTE_NO_ACTION

export const ORDER_NOTE_ACTIONS = vlConstants.ORDER_NOTE_ACTIONS

export const ORDER_SPINOFF_ACTIONS = vlConstants.ORDER_SPINOFF_ACTIONS
