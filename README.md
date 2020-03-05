# eshop-api

unified api to common eshops

## Development Setup

Running locally isn't currently supported. We deploy a test version of the app to [now](https://zeit.co/) and then test that in slack. There is an Airtable base for testing and also a test Slack App.

_Ask for access to AlzaBot-Test Slack app._  
_Ask for access to Airtable base: EShop Orders Test._

Create two new slack channels. One for _news_channel_ another for _order_channel_. Add _alzabottest_ app to both channels.
Make a copy of `.env-dev` called `.env` and replace the following values:

```
office_manager - your slack id
news_channel - news channel id
order_channel - order channel id

slack_api_token - ask for this (or find it on AlzaBot-Test app website)
slack_bot_token - ask for this (or find it on AlzaBot-Test app website)
airtable_api_key - ask for this 
airtable_base - ask for this
```

### Deploy

As the project is deployed via now, you need access to now in order to deploy. And you also need to have now installed globally:

```
yarn global add now
```

Create a new deployment in now with the current .env:

```
yarn deploy-dev
```

Wait for it to finish (this can take even 5 minutes or more) and then crate an alias `alzabot-test` for the latest deployment:

```
now alias alzabot-test
```

Now you should be able to make an order through the `alzabottest` app.

Notes:
- deploying always creates a new deployment - the old ones can't be overwritten
- the oldest deployment is usually the production one (don't delete this unless you know what you are doing)
- test deployment uses the same database as production
- test deployment uses the same alza account as production - do not add stuff to cart
- you can view existing deployments with `now ls eshop-api`
- remove old deployments with `now remove [deployment id]` (just be careful not to delete the production deployment if you don't mean to do so).
- [Now CLI reference](https://zeit.co/docs/now-cli#getting-started) 
