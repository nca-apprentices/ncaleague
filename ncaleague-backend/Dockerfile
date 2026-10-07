# Built from the repository root, which holds the OpenAPI document.
FROM openapitools/openapi-generator-cli:v7.25.0 AS models
COPY api/openapi.yaml /api/openapi.yaml
RUN java -jar /opt/openapi-generator/modules/openapi-generator-cli/target/openapi-generator-cli.jar \
    generate -i /api/openapi.yaml -g typescript-fetch -o /api/types

FROM oven/bun:1.4.2-alpine
WORKDIR /ncaleague/ncaleague-backend
COPY ncaleague-backend/package.json ncaleague-backend/bun.lock ./
RUN bun install --frozen-lockfile
COPY ncaleague-backend/ ./
COPY --from=models /api/types /ncaleague/api/types
RUN bun run build
USER bun
# Bun serves in development mode otherwise, which answers an error with its
# stack trace.
ENV NODE_ENV=production
EXPOSE 3000
# Migrates before serving. The image has no pg_dump, so dbmate skips writing
# db/schema.sql. exec makes the server PID 1, so it receives SIGTERM.
CMD ["sh", "-c", "bun run dbmate --no-dump-schema up && exec bun target/index.js"]
