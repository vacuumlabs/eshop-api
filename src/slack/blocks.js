// block-building helpers used in several bots now - invoicer, payroll-bot, coffee-bot, askmebot, ...

/**
 * @param {string} text
 * @returns {import('@slack/bolt').HeaderBlock}
 */
export const getHeaderBlock = (text) => ({
  type: 'header',
  text: {
    type: 'plain_text',
    text,
  },
})

/**
 * @param {string} text
 * @returns {import('@slack/bolt').SectionBlock}
 */
export const getSectionBlock = (text) => ({
  type: 'section',
  text: {
    type: 'mrkdwn',
    text,
  },
})

/**
 * @param {string} text
 * @returns {import('@slack/bolt').ContextBlock}
 */
export const getContextBlock = (text) => ({
  type: 'context',
  elements: [
    {
      type: 'mrkdwn',
      text,
    },
  ],
})

/**
 * @param {Pick<import('@slack/bolt').Button, 'action_id' | 'style' | 'url' | 'confirm'> & {text: string}} buttonInfo
 * @returns {import('@slack/bolt').Button}
 */
export const getButton = ({action_id, text, style, url}) => ({
  type: 'button',
  action_id,
  text: {
    type: 'plain_text',
    text,
  },
  style,
  url,
})

/**
 * @param {Pick<import('@slack/bolt').ActionsBlock, 'block_id' | 'elements'>} actionsInfo
 * @returns {import('@slack/bolt').ActionsBlock}
 */
export const getActionsBlock = ({block_id, elements}) => ({
  type: 'actions',
  block_id,
  elements,
})
