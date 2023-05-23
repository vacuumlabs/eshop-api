import knexLib from 'knex'
import config from '../src/config'

const knex = knexLib(config.knex)

export default knex
