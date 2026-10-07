package league

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"path"
	"strings"
	"time"

	"github.com/lib/pq"
)

// store reads and writes the league's tables. Values reach the database
// only as parameters.
type store struct{ q querier }

// querier runs statements on the pool or in a transaction.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// filter picks and orders the matches to load. Callers pass only these
// constants, so no input reaches the SQL text.
type filter string

const (
	matchByID     filter = "WHERE id = $1"
	gameMatches   filter = "WHERE game_id = $1 ORDER BY start_date"
	liveMatches   filter = "WHERE status = 'live' ORDER BY start_date"
	doneMatches   filter = "WHERE status = 'done' ORDER BY start_date"
	newestMatches filter = "ORDER BY start_date DESC"
)

// matches loads the matches with their scorers. Goals written before the
// API checked bodies may lack a player.
func (s store) matches(ctx context.Context, f filter, args ...any) ([]Match, error) {
	rows, err := s.q.QueryContext(ctx, `
		SELECT id, game_id, location, mode, start_date, status = 'done',
			blue_offensive, blue_defensive, red_offensive, red_defensive,
			(SELECT count(*) FROM matches o WHERE o.game_id = m.game_id AND o.start_date <= m.start_date),
			array(SELECT coalesce(scoring_player, '') FROM goals WHERE match_id = m.id ORDER BY time_stamp)
		FROM matches m `+string(f), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ms := []Match{}
	for rows.Next() {
		var m Match
		err := rows.Scan(&m.ID, &m.GameID, &m.Location, &m.Mode, &m.Start, &m.Done,
			&m.Players[0], &m.Players[1], &m.Players[2], &m.Players[3], &m.Number, pq.Array(&m.Scorers))
		if err != nil {
			return nil, err
		}
		m.Start = m.Start.UTC()
		ms = append(ms, m)
	}
	return ms, rows.Err()
}

func (s store) match(ctx context.Context, id string) (Match, error) {
	ms, err := s.matches(ctx, matchByID, id)
	if err != nil {
		return Match{}, err
	}
	if len(ms) == 0 {
		return Match{}, ErrNotFound
	}
	return ms[0], nil
}

func (s store) players(ctx context.Context) ([]string, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT name FROM players ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func (s store) insertPlayer(ctx context.Context, name string) error {
	_, err := s.q.ExecContext(ctx, `INSERT INTO players (name) VALUES ($1) ON CONFLICT DO NOTHING`, name)
	return err
}

const insertMatch = `
	INSERT INTO matches (id, game_id, location, status, mode, start_date,
		blue_offensive, blue_defensive, red_offensive, red_defensive)
	VALUES ($1, $2, $3, 'live', $4, $5, $6, $7, $8, $9)`

func matchArgs(m Match) []any {
	p := m.Players
	return []any{m.ID, m.GameID, m.Location, m.Mode, m.Start, p[0], p[1], p[2], p[3]}
}

func (s store) insertMatch(ctx context.Context, m Match) error {
	_, err := s.q.ExecContext(ctx, insertMatch, matchArgs(m)...)
	return err
}

// insertGame stores a game with its first match in one statement, so a
// match the database rejects leaves no game behind.
func (s store) insertGame(ctx context.Context, m Match, tokenHash string) error {
	_, err := s.q.ExecContext(ctx, `WITH game AS (INSERT INTO games (id, token_hash) VALUES ($2, $10))`+insertMatch,
		append(matchArgs(m), tokenHash)...)
	return err
}

func (s store) insertGoal(ctx context.Context, matchID, player string, at time.Time) error {
	_, err := s.q.ExecContext(ctx, `INSERT INTO goals (match_id, scoring_player, time_stamp) VALUES ($1, $2, $3)`,
		matchID, player, at)
	return err
}

func (s store) deleteLastGoal(ctx context.Context, matchID string) error {
	_, err := s.q.ExecContext(ctx, `
		DELETE FROM goals WHERE match_id = $1
		AND time_stamp = (SELECT max(time_stamp) FROM goals WHERE match_id = $1)`, matchID)
	return err
}

func (s store) finish(ctx context.Context, matchID string) error {
	_, err := s.q.ExecContext(ctx, `UPDATE matches SET status = 'done' WHERE id = $1`, matchID)
	return err
}

func (s store) reopen(ctx context.Context, matchID string) error {
	_, err := s.q.ExecContext(ctx, `UPDATE matches SET status = 'live' WHERE id = $1`, matchID)
	return err
}

// deleteMatch deletes the match with its goals.
func (s store) deleteMatch(ctx context.Context, id string) error {
	_, err := s.q.ExecContext(ctx, `
		WITH goals AS (DELETE FROM goals WHERE match_id = $1)
		DELETE FROM matches WHERE id = $1`, id)
	return err
}

// lockGame holds the game until the transaction ends, so the changes to
// one game happen one at a time.
func (s store) lockGame(ctx context.Context, id string) error {
	_, err := s.q.ExecContext(ctx, `SELECT FROM games WHERE id = $1 FOR UPDATE`, id)
	return err
}

// tokenHash returns the hash of the game's token, or "" when the game
// doesn't exist or predates tokens.
func (s store) tokenHash(ctx context.Context, gameID string) (string, error) {
	var hash string
	err := s.q.QueryRowContext(ctx, `SELECT coalesce(token_hash, '') FROM games WHERE id = $1`, gameID).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return hash, err
}

// lastActivity returns the time of the game's latest goal or match start.
func (s store) lastActivity(ctx context.Context, gameID string) (time.Time, error) {
	var last time.Time
	err := s.q.QueryRowContext(ctx, `
		SELECT greatest(max(m.start_date), max(g.time_stamp))
		FROM matches m LEFT JOIN goals g ON g.match_id = m.id
		WHERE m.game_id = $1`, gameID).Scan(&last)
	return last, err
}

//go:embed migrations/*.sql
var migrations embed.FS

// migrate applies the migrations the database lacks, in name order, each
// in its own transaction. It keeps dbmate's schema_migrations table, so a
// database dbmate migrated carries on.
func migrate(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(128) PRIMARY KEY)`)
	if err != nil {
		return err
	}

	files, _ := fs.Glob(migrations, "migrations/*.sql")
	for _, file := range files {
		src, _ := migrations.ReadFile(file)
		up, _, _ := strings.Cut(string(src), "-- migrate:down")
		version, _, _ := strings.Cut(path.Base(file), "_")
		if err := apply(ctx, db, version, up); err != nil {
			return fmt.Errorf("%s: %w", file, err)
		}
	}
	return nil
}

func apply(ctx context.Context, db *sql.DB, version, up string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, version)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil
	}
	if _, err := tx.ExecContext(ctx, up); err != nil {
		return err
	}
	slog.InfoContext(ctx, "migrated", "version", version)
	return tx.Commit()
}
