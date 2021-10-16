
exports.up = async (knex) => {
  await knex.schema.hasColumn('order', 'isHome').then(async (exists) => {
    if (!exists) {
      await knex.schema.table('order', (table) => {
        table.boolean('isHome')
      })
    }
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('isHome')
  })
}
