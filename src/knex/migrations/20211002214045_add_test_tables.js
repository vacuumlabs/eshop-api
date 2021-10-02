
exports.up = async (knex) => {
  await knex.schema.createTable('testOrder', (table) => {
    table.increments('id').primary()
    table.string('user').notNullable()
    table.string('ts').notNullable()
    table.boolean('isCompany').notNullable()
    table.text('reason')
    table.string('office').notNullable().defaultTo('')
    table.boolean('isUrgent')
    table.boolean('isHome')
  })

  await knex.schema.createTable('testOrderItem', (table) => {
    table.increments('id').primary()
    table.integer('order').references('testOrder.id')
    table.string('shopId').notNullable()
    table.integer('count').notNullable()
    table.string('url', 1000).notNullable()
    table.decimal('price')
  })
}

exports.down = async (knex) => {
  await knex.schema.dropTable('testOrderItem')
  await knex.schema.dropTable('testOrder')
}
