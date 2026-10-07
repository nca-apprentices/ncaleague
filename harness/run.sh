#!/usr/bin/env bash
# Builds the production images, starts them on a fresh database, and runs the
# API suite and then the browser suite against localhost:8080. Set COMPOSE to
# "docker compose" where Podman is missing.
set -euo pipefail
cd "$(dirname "$0")"

compose=(${COMPOSE:-podman compose})
base=http://localhost:8080

"${compose[@]}" down --volumes
trap '"${compose[@]}" down --volumes' EXIT
if ! "${compose[@]}" up --detach --build --wait; then
  "${compose[@]}" logs
  exit 1
fi

# The API files share one database and depend on what earlier files created,
# so they run one at a time in name order. The browser suite runs even when
# the API suite fails, so one run reports both.
status=0
hurl --test --jobs 1 --variable "base=$base" api/*.hurl || status=1
(cd e2e && npm ci && npx playwright install chromium && BASE_URL="$base" npx playwright test) || status=1
exit "$status"
