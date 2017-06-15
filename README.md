# eshop-api
unified api to common eshops

## Development Setup

* Install PostgreSQL via Docker to IP 192.168.99.100 and port 32769
* Connect to your database
```
psql -h 192.168.99.100 -p 32769 -U postgres
create database eshop;
\connect eshop;
create schema eshop;
\quit
```
* Run migrations
```
yarn knex migrate:latest
```
