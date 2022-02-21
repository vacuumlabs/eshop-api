exports.up = async (knex) => {
  await knex.schema.alterTable('testOrder', (table) => {
    table.renameColumn('spinoff', 'company')
  })
  await knex.schema.alterTable('order', (table) => {
    table.renameColumn('spinoff', 'company')
  })
}

exports.down = async (knex) => {
  await knex.schema.alterTable('testOrder', (table) => {
    table.renameColumn('company', 'spinoff')
  })
  await knex.schema.alterTable('order', (table) => {
    table.renameColumn('company', 'spinoff')
  })
}
