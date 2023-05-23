exports.up = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.string('spinoff')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('spinoff')
  })
}
