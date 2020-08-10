// todo: set correct values
export const sheets = {
  personalOrders: {
    id: 2015633882,
    name: 'Personal Orders',
    rowOffset: 0,
    fieldsRow: 1,
    idRange: 'Personal Orders!A1:A',
  },
  companyOrders: {
    id: 0,
    name: 'Electronics',
    rowOffset: 2,
    fieldsRow: 1,
    idRange: 'Electronics!A3:A',
  },
  settings: {
    id: 1276502073,
    name: 'Settings',
    jiraIdRange: 'Settings!F2:F',
    slackIdRange: 'Settings!K2:K',
    markedCell: {
      startRowIndex: 1,
      endRowIndex: 2,
      startColumnIndex: 11,
      endColumnIndex: 12,
    },
  },
}

export const NEW_ORDER_STATUS = 'requested'
