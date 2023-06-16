import {getContextBlock, getHeaderBlock, getSectionBlock} from '../blocks'

export const HOME_BLOCKS = [
  getSectionBlock('This is the AlzaBot for *Wincent*.'),
  getSectionBlock(
    'The name suggests that AlzaBot only takes orders from <https://alza.sk|Alza.sk> or <https://alza.cz|Alza.cz>, but this is not the case. Although Alza is preferred because we get better rates, buy on credit and usually even a discount - you can also order from another electronics e-shop.',
  ),
  getHeaderBlock('I want to make an order'),
  getSectionBlock(
    'Just go to messages tab and tell me what you want. Copy and paste one or multiple links from Alza and I will order them for you. If you want to get more than one piece of each item, prepend it with a number (or number and `x`).\n\n',
  ),
  getSectionBlock(
    '*Example:* \n\n ``` 3 https://www.alza.sk/seagate-expansion-portable-2000gb-d2418313.htm \n https://www.alza.sk/lenovo-laser-wireless-mouse-d506850.htm \n 2x https://www.alza.sk/epico-hero-case-iphone-13-pro-61-transparentny-d6659216.htm```',
  ),
  getContextBlock('Order three external discs, one computer mouse, and two phone cases.'),
  getHeaderBlock('Company orders'),
  getSectionBlock(
    'If you need anything for your work, order it. You can really order *anything*. I will just ask you during your order to explain how is it work-related and why should we buy it.',
  ),
  getHeaderBlock('Personal orders'),
  getSectionBlock(
    'You can get a 20% discount on PCs, laptops, tablets, smartphones, displays, and TVs. Types of electronics not elligible for discount are: \n\n• pieces over €2,000 (including VAT)\n• home appliances\n• cameras, speakers and game consoles.\n\nIf in doubt, reach out to <@UCCGCKGEL>.',
  ),
]
