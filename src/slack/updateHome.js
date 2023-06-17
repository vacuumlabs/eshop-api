/**
 * @param {import('@slack/bolt').App['client']} client
 * @param {string} userId
 * @param {import('@slack/bolt').HomeView['blocks']} blocks
 */
export const updateHome = async (client, userId, blocks) => {
  await client.views.publish({
    user_id: userId,
    view: {
      type: 'home',
      blocks,
    },
  })
}
