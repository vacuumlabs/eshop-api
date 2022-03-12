import * as vlConstants from './vacuumlabs/constants'
import * as testConstants from './test/constants'
import * as wincentConstants from './wincent/constants'

const REASON = 'reason'
const MANAGER = 'manager'
const BUTTON = 'button'
const QUESTION = 'question'
export const NAME = 'name'

export const WITHOUT_NOTE_ACTION = {
  name: 'without_note',
  text: 'Continue without note',
  type: 'button',
  value: 'without_note',
}

export const INVALID_LINK_ERROR =
  ':exclamation: The links you sent me are invalid.\nIf you want to add a comment, please start by sending the links first and you will be asked for a note later in the process.'

const REASON_WITH_ADDRESS_QUESTION = {
  [NAME]: REASON,
  [QUESTION]:
    ":question: Why do you need these items? Reply by sending a message. And don't forget to tell us your address!",
}

const REASON_DEFAULT_QUESTION = {
  [NAME]: REASON,
  [QUESTION]: ':question: Why do you need these items? Reply by sending a message.',
}

const REASON_NOTE_QUESTION = {
  [NAME]: REASON,
  [QUESTION]: ":pencil: Add a note by sending a message. And don't forget to tell us your address!",
}

const REASON_COMMENT_QUESTION = {
  [NAME]: REASON,
  [QUESTION]: ':pencil: Send your comment in a message.',
  [BUTTON]: WITHOUT_NOTE_ACTION,
}

const MANAGER_QUESTION = {
  [NAME]: MANAGER,
  [QUESTION]: ':question: Name of your manager (needed for approval for items above 100 EUR - write N/A otherwise):',
}

export const COMPANY = 'company'
export const PERSONAL = 'personal'
export const OFFICE = 'office'
export const HOME = 'home'

const NOTIFICATION = {
  accepted: 'Your order was accepted by office manager. You will be notified when the items get ordered.',
  ordered: 'Your items were ordered. You will be notified when they arrive.',
  delivered: {
    [COMPANY]: {
      [OFFICE]: 'Your order has arrived :truck:. Come pick it up during office hours.',
      [HOME]: 'Your order has arrived :truck:.',
    },
    [PERSONAL]: {
      [OFFICE]:
        'Your personal order has arrived :truck:. Come pick it up during office hours and please bring the money in CASH.',
      [HOME]: 'Your personal order has arrived :truck:.',
    },
  },
}

const DEFAULT_MESSAGES = {
  home: {
    company: [REASON_WITH_ADDRESS_QUESTION, MANAGER_QUESTION],
    personal: [REASON_NOTE_QUESTION],
  },
  office: {
    company: [REASON_DEFAULT_QUESTION, MANAGER_QUESTION],
    personal: {
      note: [REASON_COMMENT_QUESTION],
    },
  },
  notification: NOTIFICATION,
}

const WINCENT_MESSAGES = {
  home: {
    company: [REASON_WITH_ADDRESS_QUESTION],
    personal: [REASON_NOTE_QUESTION],
  },
  office: {
    company: [REASON_DEFAULT_QUESTION],
    personal: {
      note: [REASON_COMMENT_QUESTION],
    },
  },

  notification: NOTIFICATION,
}

export const MESSAGES = {
  vacuumlabs: DEFAULT_MESSAGES,
  test: DEFAULT_MESSAGES,
  wincent: WINCENT_MESSAGES,
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

export const CANCEL_ORDER_ACTION = vlConstants.CANCEL_ORDER_ACTION

export const ORDER_TYPE_ACTIONS = vlConstants.ORDER_TYPE_ACTIONS

export const ORDER_OFFICE_ACTIONS = vlConstants.ORDER_OFFICE_ACTIONS

export const ORDER_URGENT_ACTIONS = vlConstants.ORDER_URGENT_ACTIONS

export const NOTE_NO_ACTION = vlConstants.NOTE_NO_ACTION

export const ORDER_NOTE_ACTIONS = vlConstants.ORDER_NOTE_ACTIONS

export const ORDER_COMPANY_ACTIONS = vlConstants.ORDER_COMPANY_ACTIONS

export const DELIVERY_PLACE_ACTIONS = vlConstants.DELIVERY_PLACE_ACTIONS
