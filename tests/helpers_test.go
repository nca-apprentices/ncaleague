// Package tests checks the league and its pages from the outside, through
// their exported APIs. The tests that need a database create one on the
// PostgreSQL server that TEST_DATABASE_URL names, and drop it when they
// end. Without TEST_DATABASE_URL, they skip.
package tests

import (
	"context"
	"database/sql"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"testing"
	"uuid"

	_ "github.com/lib/pq"

	"github.com/nca-apprentices/ncaleague/league"
)

// TestMain keeps the app's logs out of the test output.
func TestMain(m *testing.M) {
	slog.SetDefault(slog.New(slog.DiscardHandler))
	os.Exit(m.Run())
}

// newLeague opens a league on a fresh database. It also returns the
// database, so a test can set up what the API can't, such as an hour
// passing.
func newLeague(t *testing.T) (*league.League, *sql.DB) {
	t.Helper()
	server := os.Getenv("TEST_DATABASE_URL")
	if server == "" {
		t.Skip("TEST_DATABASE_URL names no PostgreSQL server")
	}
	ctx := context.Background()

	admin, err := sql.Open("postgres", server)
	if err != nil {
		t.Fatal(err)
	}
	name := "ncaleague_test_" + strings.ReplaceAll(uuid.NewV4().String(), "-", "")
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}

	u, err := url.Parse(server)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		admin.ExecContext(ctx, "DROP DATABASE "+name+" WITH (FORCE)")
		admin.Close()
	})

	l, err := league.Open(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	return l, db
}

// holder is a browser that holds the token.
func holder(token string) league.Tokens {
	return func(string) string { return token }
}

// stranger is a browser that holds no token.
var stranger = holder("")

// start starts a game and fails the test if that fails.
func start(t *testing.T, l *league.League, mode string, names ...string) (league.Match, string) {
	t.Helper()
	m, token, err := l.Start(context.Background(), names, "Zurich", mode)
	if err != nil {
		t.Fatalf("Start(%v, %s): %v", names, mode, err)
	}
	return m, token
}

// score scores goals for the player and returns the match the game goes
// on with.
func score(t *testing.T, l *league.League, m league.Match, token, player string, goals int) league.Match {
	t.Helper()
	for range goals {
		var err error
		if m, err = l.Score(context.Background(), m.ID, player, holder(token)); err != nil {
			t.Fatalf("Score(%s): %v", player, err)
		}
	}
	return m
}

// seats names the players as blue offense, blue defense, red offense, and
// red defense.
type seats = [4]string
