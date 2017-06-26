import transenv from 'transenv'
export default transenv()(({str, bool, num}) => {
  const env = str('NODE_ENV', 'development')
  const isDevelopment = env === 'development'

  return {
    env,
    port: str('PORT'),
    approvalTreshold: num('approval_treshold'),
    officeManager: str('office_manager'),
    newsChannel: str('news_channel'),
    alza: {
      credentials: {
        userName: str('alza_username'),
        password: str('alza_password'),
      },
    },
    knex: {
      client: 'pg',
      connection: {
        host: str('db_host'),
        port: str('db_port'),
        ssl: bool('db_ssl'),
        user: str('db_user'),
        password: str('db_password'),
        database: str('db_name'),
      },
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
    airtable: {
      apiKey: str('airtable_api_key'),
      base: str('airtable_base'),
    },
  }
})
