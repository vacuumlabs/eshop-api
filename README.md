# eshop-api

unified api to common eshops

## Development Setup

There is a Google Sheet for testing and also a test Slack App. However, the dev Google Sheet is currently out of sync with the production one, so I suggest carefuly testing against that and reverting all your changes after you are done.

_Ask for access to AlzaBot-Test Slack app_ [here](https://api.slack.com/apps/AEV7B5Y5D/interactive-messages?).\
_Ask for access to Google Sheets ElectornicsDev and Electronics sheet._

Create three new slack channels. For _news_channel_, _order_channel_ and _support_channel_. Add the _alzabottest_ app to all channels.
Make a copy of `.env-dev` called `.env` and replace placeholders with actual values (ask for any values you cannot obtain yourself).

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

### Deployment

App is deployed to Heroku. Every merge to `master` is automatically deployed to production.
