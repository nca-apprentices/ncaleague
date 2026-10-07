#!/usr/bin/env bash
# Builds the production image, starts it on a fresh database, and runs the
# browser suite against it. Set COMPOSE to "docker compose" where Podman is
# missing, and PORT to serve elsewhere than 8080.
set -euo pipefail
cd "$(dirname "$0")"

compose=(${COMPOSE:-podman compose} --project-name "ncaleague-e2e-${PORT:-8080}")
base=http://localhost:${PORT:-8080}

"${compose[@]}" down --volumes
trap '"${compose[@]}" down --volumes' EXIT
if ! "${compose[@]}" up --detach --build --wait; then
  "${compose[@]}" logs
  exit 1
fi

# The app listens once it has migrated the database.
for _ in $(seq 60); do
  curl --silent --fail "$base/health" >/dev/null && break
  sleep 1
done

npm ci
npx playwright install chromium
BASE_URL="$base" npx playwright test
