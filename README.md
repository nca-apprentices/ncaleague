# ncaleague

A table soccer league: players, matches, goals, and rankings.

| Path                  | What it is                                     |
| --------------------- | ---------------------------------------------- |
| `api/openapi.yaml`    | The API, which generates the types both use    |
| `ncaleague-backend/`  | Bun, Hono, Kysely, and dbmate on PostgreSQL     |
| `ncaleague-frontend/` | React, Vite, and Tailwind CSS, served by Caddy |
| `chart/`              | The Helm chart                                 |
| `harness/`            | Tests against the running production images    |

## Development

`mise install` installs Bun, Node.js, Java for the OpenAPI generator, and Helm.
The database runs with Docker Compose or Podman.

Create `ncaleague-backend/.env`:

```sh
DATABASE_URL=postgres://ncaleague:ncaleague@localhost:5432/ncaleague?sslmode=disable
```

Then start the backend on `localhost:3000`:

```sh
cd ncaleague-backend
bun install
bun run db:up
bun run db:migrate
bun run dev
```

And the frontend on `localhost:5173`:

```sh
cd ncaleague-frontend
npm install
npm run dev
```

## Harness

`harness/run.sh` builds both production images, starts them on a fresh
database behind a proxy that routes like the ingress, and tests them on
`localhost:8080`:

- `harness/api/` holds the hurl suite, which pins every route's behavior,
  including known bugs.
- `harness/e2e/` holds the Playwright suite, which plays games through the
  browser.

The script uses Podman. Set `COMPOSE="docker compose"` to use Docker instead.

## Releases

Pushing a tag such as `v1.0.0` publishes both images and the chart to
`ghcr.io/nca-apprentices`. The [infra](https://github.com/nca-apprentices/infra)
repository deploys a released chart version.
