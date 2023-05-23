exports.up = async (knex) => {
  await knex.schema.hasColumn('order', 'isUrgent').then(async (exists) => {
    if (!exists) {
      await knex.schema.table('order', (table) => {
        table.boolean('isUrgent')
      })
    }
  })
}

exports.down = async (knex) => {
  await knex.schema.table('order', (table) => {
    table.dropColumn('isUrgent')
  })
}
