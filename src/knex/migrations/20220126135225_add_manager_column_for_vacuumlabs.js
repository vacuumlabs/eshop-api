exports.up = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.string('manager')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('manager')
  })
}
