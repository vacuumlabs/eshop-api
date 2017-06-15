
exports.up = async (knex) => {

  await knex.schema.createTableIfNotExists('teams', (table) => {
    table.increments('id').primary()
    table.string('teamId').unique()
    table.string('accessToken').notNullable()
    table.string('botId').notNullable()
    table.string('botToken').notNullable()
  });
}

exports.down = async (knex) => {
  await knex.schema.dropTable('teams')
};
