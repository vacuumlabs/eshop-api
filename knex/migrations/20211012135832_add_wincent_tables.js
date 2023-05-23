exports.up = async (knex) => {
  await knex.schema.createTable('wincentOrder', (table) => {
    table.increments('id').primary()
    table.string('user').notNullable()
    table.string('ts').notNullable()
    table.boolean('isCompany').notNullable()
    table.text('reason')
    table.string('office') // nullable on wincent
    table.boolean('isUrgent')
    table.boolean('isHome')
  })

  await knex.schema.createTable('wincentOrderItem', (table) => {
    table.increments('id').primary()
    table.integer('order').references('wincentOrder.id')
    table.string('shopId').notNullable()
    table.integer('count').notNullable()
    table.string('url', 1000).notNullable()
    table.decimal('price')
  })
}

exports.down = async (knex) => {
  await knex.schema.dropTable('wincentOrderItem')
  await knex.schema.dropTable('wincentOrder')
}
