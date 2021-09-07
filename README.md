# eshop-api aka AlzaBot

Slack bot that takes order of electronics.

## Description

### Order process

- user writes AlzaBot one or more direct messages with link(s) of items to order
- user responds to several questions about the order by interacting with buttons:
  - country (if user ordered from Alza, country is determined by the language version of the first link)
  - office/home delivery
  - personal/company
  - if company - reason for the order
  - whether it is urgent
  - note
- submitted order is:
  - stored in PostgreSQL DB
  - stored in Google sheet
  - sent to common admin Slack channel
- in the common admin Slack channel admin can:
  - forward the order to admin channel dedicated for the selected office
  - decline the order (sends notification to the customer)
  - discard the order (removes the order)
- in the admin channel dedicated for the selected office admin can:
  - change order status
  - send notification to user that the order was ordered/delivered
  - mark the order as subsidy
  - close the order
  - move the order to archive channel

### Announce to all

Messages posted to channel specified in **news_channel** config are resent by Alza Bot to every user in direct message.

## Configuration

App is configured via environment variables

### Slack app

- **slack_admin_token** - [user OAuth token from](https://api.slack.com/apps/A5WH547TR/install-on-team?)
- **slack_bot_token** - [bot OAuth token from](https://api.slack.com/apps/A5WH547TR/install-on-team?)

### Channels

- **news_channel** - Slack channel ID where admin posts messages that are sent to all users
- **orders_channel** - common admin Slack channel ID (where orders are sent right after they are submitted)
- **orders_channel_sk_ba** *(optional)* - dedicated office Slack channel ID for Bratislava - Slovakia office
- **orders_channel_sk_ke** *(optional)* - dedicated office Slack channel ID for Kosice - Slovakia office
- **orders_channel_sk_pr** *(optional)* - dedicated office Slack channel ID for Presov - Slovakia office
- **orders_channel_cz_pr** *(optional)* - dedicated office Slack channel ID for Prague - Czech republic office
- **orders_channel_cz_br** *(optional)* - dedicated office Slack channel ID for Brno - Czech republic office
- **orders_channel_hu_bu** *(optional)* - dedicated office Slack channel ID for Budapest - Hungary office
- **archive_channel** - achive Slack channel ID
- **support_channel** - support Slack channel ID (debug information is sent here when something goes wrong)

### Database

- **DATABASE_URL** - PostgreSQL database connection URL; provided automatically by Heroku
- **db_schema** - database schema

### Google sheets

[Google API service account](https://cloud.google.com/docs/authentication/production#create_service_account) is needed to enable comunication with Google sheets.

- **google_sheets_email** - email of the service account
- **google_sheets_key** - base64 encoded private key the service account (including the _-----BEGIN PRIVATE KEY-----_ and _-----END PRIVATE KEY-----_)
- **google_sheets_spreadsheet_id** - ID of the spreadsheet (it's in the spreadsheet's URL)
- **google_sheets_order_id_suffix** - suffix that is added to the order ID stored in the sheet

Other configuration related to Google sheets is stored in _src/sheets/constants.js_.

### Misc

- **NODE_ENV** *(optional, default - development)*
- **log_level** *(optional, default - debug if NODE_ENV is development, error otherwise) - winston level of logs that are written
- **PORT** - port number where server starts, provided by Heroku automatically

### Obsolete configuration

These configuration values are not used but they still need to be present:

- **alza_username** - username of alza.sk account
- **alza_password** - password of alza.sk account
- **alza_cz_username** - username of alza.cz account
- **alza_cz_password** - password of alza.cz account
- **alza_hu_username** - username of alza.hu account
- **alza_hu_password** - password of alza.hu account
- **currency** *(optional, default - EUR)* - default currency which is used to show prices

Logging in to Alza account was disabled because they use captcha, so usernames and passwords are technically not used.

## Production environment

App is deployed to Heroku _https://dashboard.heroku.com/apps/vacuumlabs-alzabot_ . Every merge to `master` is automatically deployed to production.

Slack app: [AlzaBot](https://api.slack.com/apps/A5WH547TR)

Google sheet: [Electronics](https://docs.google.com/spreadsheets/d/1iy1MTnOu87myr3t55V9vwPkxKPYG5tVDz_IPSCt6r00/edit#gid=35827040)
- company orders: sheet _Electronics_
- personal orders: sheet _Personal Orders_

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

