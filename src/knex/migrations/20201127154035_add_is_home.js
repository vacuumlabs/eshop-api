
exports.up = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.boolean('isHome')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('isHome')
  })
}
