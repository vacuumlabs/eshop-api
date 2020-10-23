
exports.up = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.boolean('isUrgent')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('isUrgent')
  })
}
