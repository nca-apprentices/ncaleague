// Package league keeps a table soccer league: its players, games, matches,
// goals, and ranking. Only the browser that started a game may change it.
package league

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"uuid"
)

// League is the league on its database.
type League struct {
	store
	db *sql.DB
}

var (
	// ErrInvalid reports input the league can't take, such as a fifth
	// player.
	ErrInvalid = errors.New("invalid")
	// ErrForbidden reports a change the browser may not make, such as a
	// goal in another browser's game.
	ErrForbidden = errors.New("forbidden")
	// ErrNotFound reports a match or game that doesn't exist.
	ErrNotFound = errors.New("not found")
)

// Tokens looks up the token a browser holds for a game, or "" for none.
type Tokens func(gameID string) string

// Open migrates the database and returns its league.
func Open(ctx context.Context, db *sql.DB) (*League, error) {
	if err := migrate(ctx, db); err != nil {
		return nil, err
	}
	return &League{store{db}, db}, nil
}

// Ping checks that the database answers.
func (l *League) Ping(ctx context.Context) error {
	return l.db.PingContext(ctx)
}

// Players returns the names of all players in order.
func (l *League) Players(ctx context.Context) ([]string, error) {
	return l.players(ctx)
}

// Live returns the running matches, oldest first.
func (l *League) Live(ctx context.Context) ([]Match, error) {
	return l.matches(ctx, liveMatches)
}

// History returns all matches, newest first.
func (l *League) History(ctx context.Context) ([]Match, error) {
	return l.matches(ctx, newestMatches)
}

func (l *League) Match(ctx context.Context, id string) (Match, error) {
	return l.match(ctx, id)
}

// Game returns a game's matches in the order played.
func (l *League) Game(ctx context.Context, id string) ([]Match, error) {
	ms, err := l.matches(ctx, gameMatches, id)
	if err == nil && len(ms) == 0 {
		err = ErrNotFound
	}
	return ms, err
}

// Ranking returns the players by win rate over the finished matches, best
// first. A running match counts once it ends.
func (l *League) Ranking(ctx context.Context) ([]Rank, error) {
	names, err := l.players(ctx)
	if err != nil {
		return nil, err
	}
	ms, err := l.matches(ctx, doneMatches)
	return ranking(names, ms), err
}

// MayChange says whether the token lets its holder change the game.
func (l *League) MayChange(ctx context.Context, gameID, token string) bool {
	return l.authorize(ctx, gameID, token, holderOnly) == nil
}

// Start starts a game of four players, adding the ones the league doesn't
// know yet. It returns the first match and the game's token.
func (l *League) Start(ctx context.Context, names []string, location, mode string) (Match, string, error) {
	if len(names) != 4 || !slices.Contains(locations, location) || !slices.Contains(modes, mode) {
		return Match{}, "", fmt.Errorf("%w: a game needs four players, a location, and a mode", ErrInvalid)
	}
	var players [4]string
	for i, name := range names {
		players[i] = strings.ToLower(name)
		if !validName.MatchString(players[i]) || slices.Contains(players[:i], players[i]) {
			return Match{}, "", fmt.Errorf("%w: names must differ and hold only letters, digits, dots, hyphens, and underscores", ErrInvalid)
		}
	}
	for _, name := range players {
		if err := l.insertPlayer(ctx, name); err != nil {
			return Match{}, "", err
		}
	}

	ranks, err := l.Ranking(ctx)
	if err != nil {
		return Match{}, "", err
	}
	m := Match{
		ID:       uuid.NewV4().String(),
		GameID:   uuid.NewV4().String(),
		Location: location,
		Mode:     mode,
		Start:    now(),
		Players:  teams(players, ranks),
		Number:   1,
	}
	token := rand.Text()
	if err := l.insertGame(ctx, m, hash(token)); err != nil {
		return Match{}, "", err
	}
	slog.InfoContext(ctx, "game started", "match", m)
	return m, token, nil
}

// Rematch starts a new game with the players and location of a game.
func (l *League) Rematch(ctx context.Context, gameID, mode string) (Match, string, error) {
	ms, err := l.Game(ctx, gameID)
	if err != nil {
		return Match{}, "", err
	}
	return l.Start(ctx, ms[0].Players[:], ms[0].Location, mode)
}

// Score adds the player's goal. It returns the match the game goes on
// with: the same one, the next one, or the last one, finished.
func (l *League) Score(ctx context.Context, matchID, player string, tokens Tokens) (Match, error) {
	var scored, shown Match
	err := l.change(ctx, matchID, tokens, holderOnly, func(t *League, m Match) error {
		if m.Done || m.finished() {
			return ErrForbidden
		}
		if !slices.Contains(m.Players[:], player) {
			return fmt.Errorf("%w: the player doesn't play in this match", ErrInvalid)
		}
		if err := t.insertGoal(ctx, m.ID, player, now()); err != nil {
			return err
		}

		m.Scorers = append(m.Scorers, player)
		m.Done = m.finished()
		scored, shown = m, m
		if !m.Done {
			return nil
		}
		if err := t.finish(ctx, m.ID); err != nil || m.Over() {
			return err
		}
		shown = next(m)
		return t.insertMatch(ctx, shown)
	})
	if err != nil {
		return Match{}, err
	}

	slog.InfoContext(ctx, "goal", "player", player, "match", scored)
	if scored.Done {
		slog.InfoContext(ctx, "match finished", "winner", scored.Winner(), "match", scored)
	}
	if shown.ID != scored.ID {
		slog.InfoContext(ctx, "match started", "match", shown)
	}
	return shown, nil
}

// Undo takes back the match's last goal. In a later match without goals,
// it goes back to the match before and takes back its last goal instead.
// It returns the match to show.
func (l *League) Undo(ctx context.Context, matchID string, tokens Tokens) (Match, error) {
	var shown Match
	undone := false
	err := l.change(ctx, matchID, tokens, holderOnly, func(t *League, m Match) error {
		var err error
		switch {
		case len(m.Scorers) == 0 && m.Number > 1:
			if m, err = t.back(ctx, m); err != nil {
				return err
			}
		case m.Done:
			return ErrForbidden
		}

		shown = m
		if len(m.Scorers) == 0 {
			return nil
		}
		shown.Scorers = m.Scorers[:len(m.Scorers)-1]
		undone = true
		return t.deleteLastGoal(ctx, m.ID)
	})
	if err != nil {
		return Match{}, err
	}
	if undone {
		slog.InfoContext(ctx, "goal undone", "match", shown)
	}
	return shown, nil
}

// Abort deletes a running match. A finished match is league history, so
// it stays.
func (l *League) Abort(ctx context.Context, matchID string, tokens Tokens) error {
	var aborted Match
	err := l.change(ctx, matchID, tokens, holderOrAbandoned, func(t *League, m Match) error {
		if m.Done {
			return ErrForbidden
		}
		aborted = m
		return t.deleteMatch(ctx, m.ID)
	})
	switch {
	case errors.Is(err, ErrNotFound):
		return nil
	case err != nil:
		return err
	}
	slog.InfoContext(ctx, "match aborted", "match", aborted)
	return nil
}

// back deletes the game's latest match and reopens the one before.
func (l *League) back(ctx context.Context, m Match) (Match, error) {
	ms, err := l.matches(ctx, gameMatches, m.GameID)
	if err != nil {
		return Match{}, err
	}
	if ms[len(ms)-1].ID != m.ID {
		return Match{}, ErrForbidden
	}
	if err := l.deleteMatch(ctx, m.ID); err != nil {
		return Match{}, err
	}
	before := ms[len(ms)-2]
	before.Done = false
	return before, l.reopen(ctx, before.ID)
}

// access says who may change a game.
type access int

const (
	// Only the holder of the game's token, the browser that started it.
	holderOnly access = iota
	// The holder, or anyone once the game is abandoned.
	holderOrAbandoned
)

// change runs fn on the match in a transaction that holds its game, so
// the changes to one game happen one at a time and all or nothing. fn
// runs only when the browser may change the game.
func (l *League) change(ctx context.Context, matchID string, tokens Tokens, a access, fn func(t *League, m Match) error) error {
	m, err := l.match(ctx, matchID)
	if err != nil {
		return err
	}

	tx, err := l.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	t := &League{store: store{tx}}
	if err := t.lockGame(ctx, m.GameID); err != nil {
		return err
	}
	if m, err = t.match(ctx, matchID); err != nil {
		return err
	}
	if err := t.authorize(ctx, m.GameID, tokens(m.GameID), a); err != nil {
		return err
	}
	if err := fn(t, m); err != nil {
		return err
	}
	return tx.Commit()
}

// authorize returns ErrForbidden unless the browser's token, or for
// holderOrAbandoned the game's idleness, lets it change the game. A game
// that predates tokens has nothing to protect.
func (l *League) authorize(ctx context.Context, gameID, token string, a access) error {
	stored, err := l.tokenHash(ctx, gameID)
	switch {
	case err != nil:
		return err
	case stored == "", subtle.ConstantTimeCompare([]byte(stored), []byte(hash(token))) == 1:
		return nil
	case a == holderOrAbandoned:
		last, err := l.lastActivity(ctx, gameID)
		if err != nil || abandoned(last, now()) {
			return err
		}
	}
	return ErrForbidden
}

func hash(token string) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(token)))
}
