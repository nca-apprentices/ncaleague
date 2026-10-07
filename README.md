# ncaleague

A table soccer league: players, matches, goals, and rankings.

One Go binary renders the pages and takes the forms they post. Its only
dependency outside the standard library is the database driver `lib/pq`,
which has no dependencies of its own. The pages work without JavaScript, and
a short script adds typing aids, live scores, and a confirmation.

| Path             | What it is                                                  |
| ---------------- | ----------------------------------------------------------- |
| `cmd/ncaleague/` | The command: opens the database and serves on `:8080`       |
| `league/`        | The league: players, games, goals, ranking, and who may act |
| `web/`           | The pages and forms, with `templates/` and `static/`        |
| `trace/`         | Spans and their OTLP/HTTP exporter                          |
| `tests/`         | Go tests of `league` and `web` through their exported APIs  |
| `e2e/`           | Browser tests against the running production image          |
| `chart/`         | The Helm chart                                              |

Each package keeps its insides to itself:

- `league` exports `Open` and a `League` with reads (`Players`, `Live`,
  `History`, `Match`, `Game`, `Ranking`) and actions (`Start`, `Rematch`,
  `Score`, `Undo`, `Abort`), the `Match`, `Seat`, and `Rank` types, and the
  errors `ErrInvalid`, `ErrForbidden`, and `ErrNotFound`. Its SQL, its
  migrations, and its rules stay inside.
- `web` exports `Handler`, which serves a `League`, and `Logs`, which tags
  log lines with their request.

## Development

`mise install` installs Go, Helm, and the test tools. Start a database with
Podman or Docker:

```sh
podman run --rm -d -p 5432:5432 -e POSTGRES_USER=ncaleague -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18.6
```

Then serve on `localhost:8080`, which migrates the database first:

```sh
env DATABASE_URL='postgres://ncaleague@localhost:5432/ncaleague?sslmode=disable' go run ./cmd/ncaleague
```

## Tests

`go test ./...` runs the tests in `tests/`. The ones that need a database
create a fresh one per test on the server that `TEST_DATABASE_URL` names,
and skip without it:

```sh
env TEST_DATABASE_URL='postgres://ncaleague@localhost:5432/postgres?sslmode=disable' go test ./...
```

They cover the league's rules (seats, rotation, ranking, undo, abort, and
who may change a game) and every page and form over HTTP, including what
the app refuses.

## Logs

The app writes JSON lines to stdout. Each request logs one line, and each
game event logs its game, match, location, mode, match number, score, and
teams: `game started`, `goal`, `goal undone`, `match finished`, `match
started`, and `match aborted`. Every line written while serving a request
carries its `requestId`, and its `trace_id` and `span_id`.

## Traces

With `OTEL_EXPORTER_OTLP_ENDPOINT` set, such as `http://telemetry:4318`,
the app sends its traces there over OTLP/HTTP as the service
`OTEL_SERVICE_NAME` names, by default `ncaleague`. A request is a server
span, named by its route, and each SQL statement under it is a client
span. A request with a `traceparent` header joins the caller's trace. The
chart's `telemetry.endpoint` sets the endpoint.

## End-to-end tests

`e2e/run.sh` builds the production image, starts it on a fresh database,
and runs the Playwright suite against it. `game.spec.ts` plays games through
the browser and passes against the old React app too, so it pins the
behavior players know. `security.spec.ts` checks what the app refuses.

The script uses Podman. Set `COMPOSE="docker compose"` to use Docker instead,
and `PORT` to serve elsewhere than 8080.

## Releases

Pushing a tag such as `v1.0.0` publishes the image and the chart to
`ghcr.io/nca-apprentices`. The [infra](https://github.com/nca-apprentices/infra)
repository deploys a released chart version.
