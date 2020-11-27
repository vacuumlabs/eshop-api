exports.up = async (knex) => {

  await knex.schema.createTableIfNotExists('order', (table) => {
    table.increments('id').primary()
    table.string('user').notNullable()
    table.string('ts').notNullable()
    table.boolean('isCompany').notNullable()
    table.text('reason')
  })

  await knex.schema.createTableIfNotExists('orderItem', (table) => {
    table.increments('id').primary()
    table.integer('order').references('order.id')
    table.string('shopId').notNullable()
    table.integer('count').notNullable()
    table.string('url', 1000).notNullable()
    table.decimal('price')
  })
}

exports.down = async (knex) => {
  await knex.schema.dropTable('order')
  await knex.schema.dropTable('orderItem')
}
