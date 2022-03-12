export const SLACK_URL = 'https://richard-wap4457.slack.com'

export const NEW_USER_GREETING = `Hi!
I will get you any computer or phone equipment from Alza. Use me for both your personal and company orders.

DM me with Alza links and I'll order them. Like this:
> https://www.alza.sk/cool-smartphone https://www.alza.sk/cool-chopter https://www.alza.sk/cool-cooler

Do you want to order 3 Cool Coolers and 2 Cool Smartphones? Just tell me so:
> 3 https://www.alza.cz/cool-cooler 2 https://www.alza.cz/cool-smartphone

Happy shopping!

PS: Feel free to contribute at https://github.com/vacuumlabs/eshop-api`

const COMPANIES = [
  'Vacuumlabs',
  'Sparring',
  'Trama',
  'Rychlotest',
  'Wincent',
  'Wing Riders',
  'NuFi',
  'Capila',
  'Verdikto',
  'Daylight',
  'Cardano NFT Marketplace',
  'Ksebe',
  'Treshold Capital',
  'Robo',
  'Other',
]

const CITIES_OPTIONS = {
  bratislava: 'Bratislava',
  kosice: 'Košice',
  presov: 'Prešov',
  praha: 'Praha',
  brno: 'Brno',
  budapest: 'Budapest',
}

// backwards mapping to get city codes from city names
export const CITIES_OPTIONS_TO_CITIES = {
  [CITIES_OPTIONS.bratislava]: 'bratislava',
  [CITIES_OPTIONS.kosice]: 'kosice',
  [CITIES_OPTIONS.presov]: 'presov',
  [CITIES_OPTIONS.praha]: 'praha',
  [CITIES_OPTIONS.brno]: 'brno',
  [CITIES_OPTIONS.budapest]: 'budapest',
}

export const OFFICES = {
  sk: {
    name: 'Slovakia',
    options: [CITIES_OPTIONS.bratislava, CITIES_OPTIONS.kosice, CITIES_OPTIONS.presov],
    currency: 'EUR',
  },
  cz: {
    name: 'Czech republic',
    options: [CITIES_OPTIONS.praha, CITIES_OPTIONS.brno],
    currency: 'CZK',
  },
  hu: {
    name: 'Hungary',
    options: [CITIES_OPTIONS.budapest],
    currency: 'HUF',
  },
}

export const HOME_VALUE = 'remote'

export const CANCEL_ORDER_ACTION = {
  name: 'cancel',
  text: 'Cancel Order',
  type: 'button',
  value: 'cancel',
  style: 'danger',
}

export const ORDER_COUNTRY_ACTIONS = [
  ...Object.keys(OFFICES).map((country) => ({
    name: 'country',
    text: OFFICES[country].name,
    type: 'button',
    value: country,
  })),
  CANCEL_ORDER_ACTION,
]

export const DELIVERY_PLACE_ACTIONS = [
  {name: 'delivery', text: 'Home', type: 'button', value: 'remote'},
  {name: 'delivery', text: 'Office', type: 'button', value: 'office'},
  CANCEL_ORDER_ACTION,
]

export const ORDER_OFFICE_ACTIONS = Object.keys(OFFICES).reduce((acc, country) => {
  acc[country] = [
    ...OFFICES[country].options.map((office) => ({
      name: 'office',
      text: office,
      type: 'button',
      value: office,
    })),
    CANCEL_ORDER_ACTION,
  ]

  return acc
}, {})

export const ORDER_COMPANY_ACTIONS = [
  {
    type: 'select',
    name: 'company',
    text: 'Select company...',
    options: COMPANIES.map((company) => ({
      text: company,
      value: company,
    })),
  },
  CANCEL_ORDER_ACTION,
]

export const ORDER_TYPE_ACTIONS = [
  {name: 'type', text: 'Make Personal Order', type: 'button', value: 'is_personal'},
  {name: 'type', text: 'Make Company Order', type: 'button', value: 'is_company'},
  CANCEL_ORDER_ACTION,
]

export const ORDER_URGENT_ACTIONS = [
  {name: 'urgent', text: "It's urgent, I will pay for delivery", type: 'button', value: 'urgent_yes'},
  {name: 'urgent', text: "It's not urgent, I can wait", type: 'button', value: 'urgent_no'},
  CANCEL_ORDER_ACTION,
]

export const NOTE_NO_ACTION = {name: 'note', text: 'Continue without note', type: 'button', value: 'note_no'}

export const ORDER_NOTE_ACTIONS = [
  {name: 'note', text: 'Add note', type: 'button', value: 'note_yes'},
  NOTE_NO_ACTION,
  CANCEL_ORDER_ACTION,
]

export const ORDER_FINISH_ACTIONS = [
  {name: 'finish', text: 'Finish Order', type: 'button', value: 'finish', style: 'primary'},
  {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'},
]

export const USER_STEP_MAP = {
  country: {actions: ORDER_COUNTRY_ACTIONS, title: 'In which country is your office?'},
  delivery: {actions: DELIVERY_PLACE_ACTIONS, title: 'Where do you want to pickup the order?'},
  office: {actions: ORDER_OFFICE_ACTIONS, title: 'Select the office you belong to:'},
  type: {actions: ORDER_TYPE_ACTIONS},
  company: {actions: ORDER_COMPANY_ACTIONS, title: 'Select your company:'},
  urgent: {actions: ORDER_URGENT_ACTIONS, title: 'How urgent is your order?'},
  note: {actions: ORDER_NOTE_ACTIONS, title: ':pencil: Do you want to add a note to the order?'},
  finish: {actions: ORDER_FINISH_ACTIONS, title: ':grey_exclamation: Please review your order.'},
}
