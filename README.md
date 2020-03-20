# eshop-api

unified api to common eshops

## Development Setup

There is a Google Sheet for testing and also a test Slack App.

_Ask for access to AlzaBot-Test Slack app_ [here](https://api.slack.com/apps/AEV7B5Y5D/interactive-messages?).\
_Ask for access to Google Sheets ElectornicsDev sheet._

Create two new slack channels. One for _news_channel_ another for _order_channel_. Add the _alzabottest_ app to both channels.
Make a copy of `.env-dev` called `.env` and replace the following values:

```
office_manager - your slack id
news_channel - news channel id
order_channel - order channel id

slack_api_token - ask for this (or find it on AlzaBot-Test app website)
slack_bot_token - ask for this (or find it on AlzaBot-Test app website)
google_sheets_email - ask for this
google_sheets_key - ask for this
google_sheets_spreadsheet_id - ask for this
```

### Running locally

You can run alzabot-test locally with the help of [ngrok](https://ngrok.com/) or similar services.

First you need to setup PostgreSQL database:

```
create database eshop;
\connect eshop;
create schema eshop;
\quit
```
Then you need to change db configuration in `.env` (possibly only _db_host_ and _db_password_)

Run migrations:
```
yarn knex migrate:latest
```
After running ngrok (`ngrok http 8000`) simply paste your url [into the slack app configuration](https://api.slack.com/apps/AEV7B5Y5D/interactive-messages?) as Request URL e.g. _https://cb47f7c1.ngrok.io/actions_ - don't forget the `/actions` route. After that you can run:

```
yarn dev
``` 

Now you should be able to make an order through the `alzabottest` app.

### Dev Deploy

If you wish to test alzabot-test in the [now](https://zeit.co/) environment you can do so by deploying a test version of the app to now and then testing that in slack. Don't forget to change the url [in the slack app configuration](https://api.slack.com/apps/AEV7B5Y5D/interactive-messages?) to _https://alzabot-test.now.sh/actions_.

As the project is deployed via now, you need access to now in order to deploy. And you also need to have now installed globally:

```
yarn global add now
```

Create a new deployment in now with the current .env:

```
yarn deploy-dev
```

Wait for it to finish (this can take even 5 minutes or more). After this the app is deployed to _https://alzabot-test.now.sh_.

Now you should be able to make an order through the `alzabottest` app.

Notes:
- deploying always creates a new deployment - the old ones can't be overwritten
- the oldest deployment is usually the production one (don't delete this unless you know what you are doing)
- test deployment uses the same database as production
- test deployment uses the same alza account as production - do not add stuff to cart (you can also create your own test account and set it up in `.env`)
- you can view existing deployments with `now ls eshop-api`
- remove old deployments with `now remove [deployment id]` (just be careful not to delete the production deployment if you don't mean to do so).
- [Now CLI reference](https://zeit.co/docs/now-cli#getting-started)
