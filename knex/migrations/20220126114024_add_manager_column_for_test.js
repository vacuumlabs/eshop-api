exports.up = async (knex) => {
  await knex.schema.table('testOrder', (table) => {
    table.string('manager')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('testOrder', (table) => {
    table.dropColumn('manager')
  })
}
