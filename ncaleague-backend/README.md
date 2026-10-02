# ncaleague backend

## Usage

To bring up the DB and get the backend ready to accept requests, run the following:

```
bun run db:up
bun run db:migrate
bun run dev
```

Find more detailed information below

### Backend

Before running any other command, make sure you have installed all the dependencies with `bun install`.
Next, create `.env` as the [README](../README.md#development) shows.

Common commands you may use:

`bun run dev`: start a dev server

`bun run lint`: lint the project

`bun run build`: build backend to avoid transpiling at run time

`bun run serve`: run a preview of the build

### Database

This backend connects to a PostgreSQL database as a datastore. To ease the setup, the db is specified in a `docker compose` file.

To handle data migrations, we use `dbmate`.

`bun run db:up`: start up the docker compose stack

`bun run db:migrate`: run dbmate migrations to bring the db up to the lastest schema

`bun run db:down`: stop the db stack

## Tech stack

JS Runtime: Bun

Web framework: Hono

Database: PostgreSQL

DB Migrations: dbmate

SQL Query Builder: Kysely

Package manager: Bun

## References

Bun: https://bun.sh/docs/cli/run

Hono: https://hono.dev/top

Kysely: https://kysely.dev/docs/getting-started
