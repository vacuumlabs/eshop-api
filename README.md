# eshop-api a.k.a. AlzaBot

Slack bot that takes orders of electronics.

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
  - close the order
  - move the order to archive channel

### Announce to all

Send a message to the news channel (`channels.news` config) to have Alza bot send it as a direct message to every user in the workspace.

## Configuration

App is configured via environment variables. In `config.js`, the variables are read by `transenv` package and mapped to a runtime config object.

There are:
- workspace-specific env vars
  - currently, the app is hardcoded for three workspaces - `vacuumlabs`, `wincent` and `test`
  - the `vacuumlabs`, `wincent`, and `test` env vars accept a stringified object with all workspace-specific variables
- global env vars - workspace-agnostic variables

### Workspace-specific variables

- `channels` - object of specific channel IDs
  - `orders` - main channel where the orders are posted after being submitted by users
  - `archive` - archived orders are moved here
  - `support` - channel for bot error reports
  - `news` - check [Announce to all](#Announce-to-all)
  - `cities` - object of dedicated city channel IDs
    - e.g. vacuumlabs workspace has `bratislava`, `kosice`, `presov`, `praha`, `brno`, `budapest` properties here
- `slack` - object of OAuth tokens required for communication via Slack API, obtained from Slack bot app [OAuth page](https://api.slack.com/apps/A5WH547TR/install-on-team?)
  - `adminToken` - this is the user that installed the app. he needs to be a part of the channels and have workspace admin rights (the app is able to remove messages only by using this token)
  - `botToken` - bot token
  - `signingSecret` - bot signing secret used to initialize `@slack/bolt` app
- `dbTables` - object of the table names that handle the orders for this workspace app
  - `order` - stores the whole order, may contain multiple items
  - `orderItem` - stores the single items of the order
- `google` - object of google-sheets-related workspace-app-specific variables
  - `spreadsheetId` - taken from spreadsheet's URL

### Global variables

#### Database

- `DATABASE_URL` - PostgreSQL database connection URL; provided automatically by Heroku
- `db_schema` - database schema name

#### Google sheets

[Google API service account](https://cloud.google.com/docs/authentication/production#create_service_account) is needed to enable communication with Google sheets.

- `google_sheets_email` - email of the service account
- `google_sheets_key` - base64 encoded private key the service account (including the _-----BEGIN PRIVATE KEY-----_ and _-----END PRIVATE KEY-----_)
- `google_sheets_order_id_suffix` - suffix that is added to the order ID stored in the sheet

Other configuration related to Google sheets is stored in _src/sheets/constants.js_.

#### Misc

- `NODE_ENV` *(optional, default - "development")*
- `log_level` *(optional, default - "debug" if `NODE_ENV` is "development", "error" otherwise)* - winston level of logs that are written
- `PORT` - port number where server starts, provided by Heroku automatically

#### Obsolete configuration

These variables are currently not used but they still need to be present:

- `alza_username` - username of alza.sk account
- `alza_password` - password of alza.sk account
- `alza_cz_username` - username of alza.cz account
- `alza_cz_password` - password of alza.cz account
- `alza_hu_username` - username of alza.hu account
- `alza_hu_password` - password of alza.hu account
- `currency` *(optional, default - "EUR")* - default currency which is used to show prices

Logging in to Alza account was disabled because they use captcha, so usernames and passwords are technically not used.

## Production environment

App is deployed to Heroku _https://dashboard.heroku.com/apps/vacuumlabs-alzabot_ . Every merge to `master` is automatically deployed to production.

Slack app: [AlzaBot](https://api.slack.com/apps/A5WH547TR)

Google sheet: [Electronics](https://docs.google.com/spreadsheets/d/1iy1MTnOu87myr3t55V9vwPkxKPYG5tVDz_IPSCt6r00/edit#gid=35827040)
- company orders: sheet _Electronics_
- personal orders: sheet _Personal Orders_

### Testing production

To test the currently deployed app without polluting the real orders database and without letting the office team know about every such order, you can make use of the `test` app variant.

How it works: There's a separate Slack bot app configured with another endpoint for actions. When you write it a message and submit a request, it gets send to the test orders channel instead. It is also written to a separate Google sheet and separate database table.

## Local development setup

When running a local server, you can decide whether you'll run the database locally too or you'll use the production one with the `alzabot-test` table.

Either way, make a copy of `.env-dev` called `.env` and replace placeholders with actual values (ask for any values you can't obtain yourself).

You should have node.js and yarn installed. If you don't, try Volta - https://volta.sh/.

Install the dependencies - run:

```console
$ yarn
```

### Local database

Skip if you decided to use the production `alzabot-test` table.

To setup PostgreSQL database:

```console
// open postgres
$ psql
// if you receive the `database "user" does not exist` error, run:
$ createdb
$ psql
// in postgres prompt, run these (ignore `user=#`):
user=# create database alzabot;
user=# \c alzabot;
user=# create schema alzabot;
user=# \q
```

Run migrations:
```
$ yarn knex migrate:latest
```

Your database is now ready for local use. You can change the db configuration in `.env` (`DATABASE_URL` and `db_schema` variables).
Example:

```
DATABASE_URL=postgres://user:@localhost:5432/alzabot
db_schema=alzabot
```

### Local server

You'll need to make your server reachable from outside world - you can use [ngrok](https://ngrok.com/) or similar services.

Run ngrok (this actually runs `ngrok http 8000`):
```
$ yarn ngrok
```

After that, copy your ngrok url into the Slack app's Interactive messages configuration as Request URL, e.g. `https://cb47f7c1.ngrok.io/test/actions` - don't forget the `/<variant>/actions` route. 

Run the server:
```
$ yarn dev
```

You should be able to make an order through the *AlzaBotTest* app now.

### Own Slack app

If by any chance you need an own Slack bot app or setting up the app for a new workspace, you'll need to:
- create a legacy Slack app - this option can only be reached somewhere from the documentation (https://api.slack.com/apps?new_classic_app=1)
  - the legacy app is needed because AlzaBot still uses legacy permission scopes
- configure the actions endpoint, events endpoint (your app needs to be running), permission scopes, ...
- install the app to the workspace
- copy the user and bot tokens into the env vars
- add the app into the `orders`, `archive`, `news`, and `support` channels

## Accesses

You may need access rights:
- Google sheets - *Electronics* (vacuumlabs), *Nozdormu_office _equipment* (wincent), *AlzaBot Test sheet* (test) or your own
- Slack apps - *AlzaBot*, *Wincent-AlzaBot*, *AlzaBot Test* or your own
- heroku app - *vacuumlabs-alzabot* (production)
- workspace admin rights and being in the channels
  - this is needed for the bot to perform some actions "as user" (mainly for deleting messages and comments)
  - only such admin should (re)install the app, his token is then used as an env var
  - there are two options:
    - you are (or you become) the workspace admin
      - you install the app(s)
      - you get the user token from the Slack app's OAuth page and put it in the env vars
      - you get invited to all the channels
    - you let another workspace admin install the app
      - you list them as the Slack app's collaborator
      - they install the app
      - they send you the user token and you put it in the env vars
      - they make sure they are in all the required channels

## Migrations (knex) guide

### New migrations

If changes in database are required, you can create a new migration:
```console
$ yarn knex migrate:make your_new_migration_name
```

Find it in `knex/migrations/` folder and edit the `up` and `down` functions.

To apply the migrations to your local db:
```console
$ yarn knex migrate:latest
```

To push the changes to the production database (you need to have heroku CLI installed and be logged in to your account):
```console
$ heroku run yarn knex migrate:latest --app vacuumlabs-alzabot
```

### Rolling back

If you made a mistake and want to go one migration back (calling the `down` function):
```console
$ yarn knex migrate:down migration_name.js
```

You can do the same on production, but be extra careful:
```console
$ heroku run yarn knex migrate:down migration_name.js --app vacuumlabs-alzabot
```