import transenv from 'transenv'
export default transenv()(({str, bool, num}) => {
  const env = str('NODE_ENV', 'development')
  const isDevelopment = env === 'development'

  return {
    env,
    logLevel: str('log_level', isDevelopment ? 'debug' : 'error'),
    port: str('PORT'),
    approvalTreshold: num('approval_treshold'),
    newsChannel: str('news_channel'),
    ordersChannel: str('orders_channel'),
    ordersChannelCZ: str('orders_channel_cz'),
    ordersChannelHU: str('orders_channel_hu'),
    supportChannel: str('support_channel'),
    alza: {
      credentials: {
        sk: {
          userName: str('alza_username'),
          password: str('alza_password'),
        },
        cz: {
          userName: str('alza_cz_username'),
          password: str('alza_cz_password'),
        },
        hu: {
          userName: str('alza_hu_username'),
          password: str('alza_hu_password'),
        },
      },
    },
    knex: {
      client: 'pg',
      connection: str('DATABASE_URL'),
      searchPath: str('db_schema'),
      schema: str('db_schema'),
      debug: isDevelopment,
      migrations: {
        directory: 'src/knex/migrations',
      },
    },
    slack: {
      apiToken: str('slack_api_token'),
      botToken: str('slack_bot_token'),
    },
    currency: str('currency', 'EUR'),
    google: {
      email: str('google_sheets_email'),
      key: str('google_sheets_key'),
      spreadsheetId: str('google_sheets_spreadsheet_id'),
    },
  }
})
