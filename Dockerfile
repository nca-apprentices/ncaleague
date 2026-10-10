FROM golang:1.27.2 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY league league
COPY trace trace
COPY web web
# The release workflow passes the git tag, which the navigation bar shows.
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o /ncaleague ./cmd/ncaleague

# The binary embeds the pages, the migrations, and the time zones, so the
# image holds nothing else. It migrates the database before serving.
FROM scratch
COPY --from=build /ncaleague /ncaleague
USER 65534:65534
EXPOSE 8080
ENTRYPOINT ["/ncaleague"]
