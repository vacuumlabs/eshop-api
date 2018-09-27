
exports.up = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.string('office').notNullable().defaultTo('')
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('office')
  })
}
