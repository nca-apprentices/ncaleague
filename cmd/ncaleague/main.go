// Command ncaleague serves a table soccer league on :8080. DATABASE_URL
// names its PostgreSQL database, which it migrates on start. With
// OTEL_EXPORTER_OTLP_ENDPOINT set, it sends its traces there as the
// service OTEL_SERVICE_NAME names.
package main

import (
	"cmp"
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"

	"github.com/nca-apprentices/ncaleague/league"
	"github.com/nca-apprentices/ncaleague/trace"
	"github.com/nca-apprentices/ncaleague/web"
)

// version is the release tag the binary was built from.
var version = "dev"

const addr = ":8080"

func main() {
	slog.SetDefault(slog.New(web.Logs(slog.NewJSONHandler(os.Stdout, nil))))
	if err := run(); err != nil {
		slog.Error("stopped", "err", err.Error())
		os.Exit(1)
	}
}

func run() error {
	// SIGTERM lets the requests in flight finish.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)

	if endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"); endpoint != "" {
		exporter := trace.Export(endpoint, cmp.Or(os.Getenv("OTEL_SERVICE_NAME"), "ncaleague"))
		defer exporter.Stop()
	}

	l, err := league.Open(ctx, db)
	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:              addr,
		Handler:           web.Handler(l, version),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       time.Minute,
		MaxHeaderBytes:    16 << 10,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()

	slog.Info("serving", "addr", addr, "version", version)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
