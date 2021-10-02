import transenv from 'transenv'
export default transenv()(({str, bool, num}) => {
  const env = str('NODE_ENV', 'development')
  const isDevelopment = env === 'development'

  const vacuumlabs = JSON.parse(str('vacuumlabs', '""'))
  const test = JSON.parse(str('test', '""'))
  const wincent = JSON.parse(str('wincent', '""'))

  return {
    env,
    logLevel: str('log_level', isDevelopment ? 'debug' : 'error'),
    port: str('PORT'),
    vacuumlabs,
    test,
    wincent,
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
    currency: str('currency', 'EUR'),
    google: {
      email: str('google_sheets_email'),
      key: str('google_sheets_key'),
      orderIdSuffix: str('google_sheets_order_id_suffix', ''),
    },
    knex: {
      client: 'pg',
      connection: `${str('DATABASE_URL')}${isDevelopment ? '' : '?sslmode=no-verify'}`,
      searchPath: str('db_schema'),
      schema: str('db_schema'),
      debug: isDevelopment,
      migrations: {
        directory: 'src/knex/migrations',
      },
    },
  }
})
