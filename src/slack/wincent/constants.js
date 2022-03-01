export const SLACK_URL = 'https://wincent.slack.com'

export const NEW_USER_GREETING = `Hi!
I will get you any computer or phone equipment from Alza. Use me for both your personal and company orders.

DM me with Alza links and I'll order them. Like this:
> https://www.alza.sk/cool-smartphone https://www.alza.sk/cool-chopter https://www.alza.sk/cool-cooler

Do you want to order 3 Cool Coolers and 2 Cool Smartphones? Just tell me so:
> 3 https://www.alza.cz/cool-cooler 2 https://www.alza.cz/cool-smartphone

Happy shopping!

PS: Feel free to contribute at https://github.com/vacuumlabs/eshop-api`


export const CANCEL_ORDER_ACTION = {name: 'cancel', text: 'Cancel Order', type: 'button', value: 'cancel', style: 'danger'}

export const ORDER_TYPE_ACTIONS = [
  {name: 'is_personal', text: 'Make Personal Order', type: 'button', value: 'is_personal'},
  {name: 'is_company', text: 'Make Company Order', type: 'button', value: 'is_company'},
  CANCEL_ORDER_ACTION,
]

export const ORDER_URGENT_ACTIONS = [
  {name: 'urgent', text: 'It\'s urgent, I will pay for delivery', type: 'button', value: 'urgent-yes'},
  {name: 'urgent', text: 'It\'s not urgent, I can wait', type: 'button', value: 'urgent-no'},
  CANCEL_ORDER_ACTION,
]

export const NOTE_NO_ACTION = {name: 'note', text: 'Continue without note', type: 'button', value: 'note-no'}

export const ORDER_NOTE_ACTIONS = [
  {name: 'note', text: 'Add note', type: 'button', value: 'note-yes'},
  NOTE_NO_ACTION,
  CANCEL_ORDER_ACTION,
]

export const USER_STEP_MAP = {
  type: {actions: ORDER_TYPE_ACTIONS},
  urgent: {actions: ORDER_URGENT_ACTIONS, title: 'How urgent is your order?'},
  note: {actions: ORDER_NOTE_ACTIONS, title: ':pencil: Do you want to add a note to the order?'},
}
