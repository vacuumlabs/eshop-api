import transenv from 'transenv'
export default transenv()(({str, bool}) => {
  const env = str('NODE_ENV', 'development')
  const isDevelopment = env === 'development'

  return {
    env,
    port: str('PORT'),
    alza: {
      credentials: {
        userName: str('alza-username'),
        password: str('alza-password'),
      }
    },
    knex: {
      client: 'pg',
      connection: str('DATABASE-URL', null) || { // env.DATABASE-URL is set by Heroku
        host: str('db-host'),
        port: str('db-port'),
        ssl: bool('db-ssl'),
        user: str('db-user'),
        password: str('db-password'),
        database: str('db-name'),
      },
      searchPath: str('db-schema'),
      schema: str('db-schema'),
      debug: isDevelopment,
      migrations: {
        directory: 'src/knex/migrations',
      },
    },
    slack: {
      apiToken: str('slack-api-token'),
      botToken: str('slack-bot-token'),
    }
  }
})
