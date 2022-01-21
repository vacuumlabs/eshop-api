exports.up = async (knex) => {
  await knex.schema.table('testOrder', (table) => {
    table.string('spinoff')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('testOrder', (table) => {
    table.dropColumn('spinoff')
  })
}
