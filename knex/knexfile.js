// extracts knex settings from config.js and exports it using a `knexfile.js` convention
// this is necessary to make knex cli work properly
require('@babel/register')

// when knexfile.js is in a subdir, knex automatically changes working directory. this needs to be reverted before we require the `config`
process.chdir(`${__dirname}/../`)
// eslint-disable-next-line no-console
console.log('Working directory changed back to', process.cwd(), 'so dotenv finds the .env file')
const config = require('../src/config')
module.exports = config.knex
