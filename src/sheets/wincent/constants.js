export const sheets = {
  personalOrders: {
    id: 520190732,
    name: 'personal orders',
    rowOffset: 0,
    fieldsRow: 1,
    idRange: 'personal orders!A1:A',
  },
  companyOrders: {
    id: 0,
    name: 'equipment list',
    rowOffset: 0,
    fieldsRow: 1,
    idRange: 'equipment list!A1:A',
  },
  settings: {
    // id: 1503144134, // used just for subsidy
    // name: 'Settings', // not used
    // TODO: find out whether it's updated
    jiraIdRange: 'Settings!E2:E',
    // TODO: find out how to get this into sheet
    slackIdRange: 'Settings!E2:E',
    // markedCell: { // used just for subsidy
    //   startRowIndex: 1,
    //   endRowIndex: 2,
    //   startColumnIndex: 11,
    //   endColumnIndex: 12,
    // },
  },
}
