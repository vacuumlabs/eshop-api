exports.up = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.string('paymentType')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('paymentType')
  })
}
