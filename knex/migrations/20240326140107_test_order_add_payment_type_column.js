exports.up = async (knex) => {
  await knex.schema.table('testOrder', (table) => {
    table.string('paymentType')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('testOrder', (table) => {
    table.dropColumn('paymentType')
  })
}
