# Built from the repository root, which holds the OpenAPI document.
FROM openapitools/openapi-generator-cli:v7.2.0 AS models
COPY api/openapi.yaml /api/openapi.yaml
RUN java -jar /opt/openapi-generator/modules/openapi-generator-cli/target/openapi-generator-cli.jar \
    generate -i /api/openapi.yaml -g typescript-fetch -o /api/types

FROM node:24.21.0-slim AS build
WORKDIR /ncaleague/ncaleague-frontend
COPY ncaleague-frontend/package.json ncaleague-frontend/package-lock.json ./
RUN npm ci
COPY ncaleague-frontend/ ./
COPY --from=models /api/types /ncaleague/api/types
# The release workflow passes the git tag, which the navigation bar shows.
ARG VERSION=dev
RUN VITE_VERSION="$VERSION" npm run build

FROM caddy:2.10.2-alpine
COPY --from=build /ncaleague/ncaleague-frontend/dist /srv
COPY ncaleague-frontend/Caddyfile /etc/caddy/Caddyfile
# The base image grants Caddy the capability to bind port 80, and a binary with
# a file capability fails to start where every capability is dropped.
RUN setcap -r /usr/bin/caddy
EXPOSE 8080
