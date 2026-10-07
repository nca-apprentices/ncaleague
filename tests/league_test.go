package tests

import (
	"cmp"
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/nca-apprentices/ncaleague/league"
)

var ctx = context.Background()

func TestStartRefusesWhatNoGameCanBe(t *testing.T) {
	l, _ := newLeague(t)
	tests := []struct {
		name           string
		names          []string
		location, mode string
	}{
		{"three players", []string{"a", "b", "c"}, "Zurich", "1-10"},
		{"five players", []string{"a", "b", "c", "d", "e"}, "Zurich", "1-10"},
		{"a player twice", []string{"a", "b", "c", "A"}, "Zurich", "1-10"},
		{"markup in a name", []string{"a", "b", "c", "<script>"}, "Zurich", "1-10"},
		{"a long name", []string{"a", "b", "c", "abcdefghijklmnopqrstuvwxyz0123456"}, "Zurich", "1-10"},
		{"an unknown location", []string{"a", "b", "c", "d"}, "Mars", "1-10"},
		{"an unknown mode", []string{"a", "b", "c", "d"}, "Zurich", "2-7"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := l.Start(ctx, tt.names, tt.location, tt.mode); !errors.Is(err, league.ErrInvalid) {
				t.Errorf("Start() = %v, want ErrInvalid", err)
			}
		})
	}

	players, _ := l.Players(ctx)
	if len(players) != 0 {
		t.Errorf("refused games added players %v", players)
	}
}

func TestStartAddsPlayersInLowercase(t *testing.T) {
	l, _ := newLeague(t)
	m, token := start(t, l, "1-10", "Q1", "q2", "q3", "Jürg")

	players, err := l.Players(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"jürg", "q1", "q2", "q3"}; !slices.Equal(players, want) {
		t.Errorf("Players() = %v, want %v", players, want)
	}

	sorted := m.Players
	slices.Sort(sorted[:])
	if sorted != (seats{"jürg", "q1", "q2", "q3"}) {
		t.Errorf("seats %v, want the four players", m.Players)
	}
	if m.Number != 1 || m.Done || m.GameID == m.ID {
		t.Errorf("first match %+v", m)
	}
	if len(token) < 26 {
		t.Errorf("token %q is too short to be secret", token)
	}
}

func TestOnlyTheTokensHolderChangesTheGame(t *testing.T) {
	l, _ := newLeague(t)
	m, token := start(t, l, "1-10", "a", "b", "c", "d")

	if !l.MayChange(ctx, m.GameID, token) || l.MayChange(ctx, m.GameID, "") || l.MayChange(ctx, m.GameID, "wrong") {
		t.Error("MayChange lets someone other than the holder change the game")
	}
	if _, err := l.Score(ctx, m.ID, m.Players[0], holder("wrong")); !errors.Is(err, league.ErrForbidden) {
		t.Errorf("Score() with the wrong token = %v, want ErrForbidden", err)
	}
	if _, err := l.Undo(ctx, m.ID, stranger); !errors.Is(err, league.ErrForbidden) {
		t.Errorf("Undo() without the token = %v, want ErrForbidden", err)
	}
	if err := l.Abort(ctx, m.ID, stranger); !errors.Is(err, league.ErrForbidden) {
		t.Errorf("Abort() without the token = %v, want ErrForbidden", err)
	}
}

func TestScore(t *testing.T) {
	l, _ := newLeague(t)
	m, token := start(t, l, "1-10", "a", "b", "c", "d")
	bo, rd := m.Players[0], m.Players[3]

	m = score(t, l, m, token, bo, 1)
	m = score(t, l, m, token, rd, 1)
	if blue, red := m.Score(); blue != 1 || red != 1 || m.Done {
		t.Errorf("after two goals %d:%d, done %t", blue, red, m.Done)
	}
	if _, err := l.Score(ctx, m.ID, "e", holder(token)); !errors.Is(err, league.ErrInvalid) {
		t.Errorf("Score() for a player outside the match = %v, want ErrInvalid", err)
	}

	m = score(t, l, m, token, bo, 9)
	if blue, red := m.Score(); blue != 10 || red != 1 || !m.Over() || m.Winner() != "blue" {
		t.Errorf("after the tenth goal %d:%d, over %t, winner %q", blue, red, m.Over(), m.Winner())
	}
	if _, err := l.Score(ctx, m.ID, bo, holder(token)); !errors.Is(err, league.ErrForbidden) {
		t.Errorf("Score() in a finished match = %v, want ErrForbidden", err)
	}

	stored, err := l.Match(ctx, m.ID)
	if err != nil || !stored.Done || len(stored.Scorers) != 11 {
		t.Errorf("stored match %+v, %v", stored, err)
	}
}

// After each match but the last, the next one starts with the players in
// new seats.
func TestPlayersRotateBetweenMatches(t *testing.T) {
	l, _ := newLeague(t)
	m1, token := start(t, l, "4-5", "a", "b", "c", "d")
	bo, bd, ro, rd := m1.Players[0], m1.Players[1], m1.Players[2], m1.Players[3]

	// After the first match, red defense stays and the others move one
	// seat along.
	m2 := score(t, l, m1, token, bo, 5)
	if want := (seats{ro, bo, bd, rd}); m2.Players != want || m2.Number != 2 || m2.Done {
		t.Fatalf("second match %v, number %d, want %v", m2.Players, m2.Number, want)
	}

	// After the second match, everyone moves one seat along.
	m3 := score(t, l, m2, token, m2.Players[3], 5)
	if want := (seats{rd, ro, bo, bd}); m3.Players != want {
		t.Fatalf("third match %v, want %v", m3.Players, want)
	}

	// After the third match, blue defense stays and red defense moves to
	// blue offense.
	m4 := score(t, l, m3, token, m3.Players[1], 5)
	if want := (seats{bd, ro, rd, bo}); m4.Players != want {
		t.Fatalf("fourth match %v, want %v", m4.Players, want)
	}

	last := score(t, l, m4, token, m4.Players[2], 5)
	if last.ID != m4.ID || !last.Over() {
		t.Fatalf("the fourth match doesn't end the game: %+v", last)
	}

	game, err := l.Game(ctx, m1.GameID)
	if err != nil {
		t.Fatal(err)
	}
	var winners []string
	for i, m := range game {
		if m.Number != i+1 || !m.Done {
			t.Errorf("match %d: number %d, done %t", i+1, m.Number, m.Done)
		}
		winners = append(winners, m.Winner())
	}
	if want := []string{"blue", "red", "blue", "red"}; !slices.Equal(winners, want) {
		t.Errorf("winners %v, want %v", winners, want)
	}
}

func TestUndo(t *testing.T) {
	l, _ := newLeague(t)
	m1, token := start(t, l, "3-5", "a", "b", "c", "d")
	bo, ro := m1.Players[0], m1.Players[2]

	// A game's first match without goals has nothing to undo.
	shown, err := l.Undo(ctx, m1.ID, holder(token))
	if err != nil || shown.ID != m1.ID || len(shown.Scorers) != 0 {
		t.Fatalf("Undo() in an empty first match = %+v, %v", shown, err)
	}

	m1 = score(t, l, m1, token, bo, 2)
	m1 = score(t, l, m1, token, ro, 1)
	if shown, err = l.Undo(ctx, m1.ID, holder(token)); err != nil || !slices.Equal(shown.Scorers, []string{bo, bo}) {
		t.Fatalf("Undo() = %v, %v, want the last goal gone", shown.Scorers, err)
	}

	// Undo in a new match without goals deletes it and takes back the
	// goal that ended the match before.
	m2 := score(t, l, shown, token, bo, 3)
	if m2.ID == m1.ID {
		t.Fatal("no second match")
	}
	if shown, err = l.Undo(ctx, m2.ID, holder(token)); err != nil || shown.ID != m1.ID || shown.Done {
		t.Fatalf("Undo() in an empty second match = %+v, %v", shown, err)
	}
	if blue, red := shown.Score(); blue != 4 || red != 0 {
		t.Errorf("reopened match %d:%d, want 4:0", blue, red)
	}
	if _, err := l.Match(ctx, m2.ID); !errors.Is(err, league.ErrNotFound) {
		t.Errorf("Match() of the undone match = %v, want ErrNotFound", err)
	}

	// A finished game takes no undo.
	over := score(t, l, shown, token, bo, 1)
	over = score(t, l, over, token, bo, 5)
	over = score(t, l, over, token, over.Players[0], 5)
	if !over.Over() {
		t.Fatalf("game not over: %+v", over)
	}
	if _, err := l.Undo(ctx, over.ID, holder(token)); !errors.Is(err, league.ErrForbidden) {
		t.Errorf("Undo() in a finished game = %v, want ErrForbidden", err)
	}
}

// A player may play in two running games. Undo takes back the goal of the
// match it names only.
func TestUndoTakesBackTheGoalOfItsMatch(t *testing.T) {
	l, _ := newLeague(t)
	first, firstToken := start(t, l, "1-10", "s1", "s2", "s3", "s4")
	second, secondToken := start(t, l, "1-10", "s1", "s5", "s6", "s7")

	score(t, l, first, firstToken, "s1", 1)
	score(t, l, second, secondToken, "s1", 1)
	if _, err := l.Undo(ctx, first.ID, holder(firstToken)); err != nil {
		t.Fatal(err)
	}

	first, _ = l.Match(ctx, first.ID)
	second, _ = l.Match(ctx, second.ID)
	if len(first.Scorers) != 0 || len(second.Scorers) != 1 {
		t.Errorf("goals left: first %v, second %v", first.Scorers, second.Scorers)
	}
}

func TestAbort(t *testing.T) {
	l, db := newLeague(t)
	m1, token := start(t, l, "3-5", "a", "b", "c", "d")
	m2 := score(t, l, m1, token, m1.Players[0], 5)
	m2 = score(t, l, m2, token, m2.Players[0], 1)

	// A finished match is league history, so it stays.
	if err := l.Abort(ctx, m1.ID, holder(token)); !errors.Is(err, league.ErrForbidden) {
		t.Errorf("Abort() of a finished match = %v, want ErrForbidden", err)
	}
	if err := l.Abort(ctx, m2.ID, holder(token)); err != nil {
		t.Fatal(err)
	}
	if _, err := l.Match(ctx, m2.ID); !errors.Is(err, league.ErrNotFound) {
		t.Errorf("Match() of the aborted match = %v, want ErrNotFound", err)
	}
	if game, err := l.Game(ctx, m1.GameID); err != nil || len(game) != 1 {
		t.Errorf("Game() after the abort = %d matches, %v, want the finished one", len(game), err)
	}
	if err := l.Abort(ctx, "missing", stranger); err != nil {
		t.Errorf("Abort() of a missing match = %v, want nil", err)
	}

	// An hour without a goal or a new match lets anyone abort the game.
	idle, _ := start(t, l, "1-10", "e", "f", "g", "h")
	if err := l.Abort(ctx, idle.ID, stranger); !errors.Is(err, league.ErrForbidden) {
		t.Errorf("Abort() of an active game by a stranger = %v, want ErrForbidden", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE matches SET start_date = start_date - interval '1 hour' WHERE id = $1`, idle.ID); err != nil {
		t.Fatal(err)
	}
	if err := l.Abort(ctx, idle.ID, stranger); err != nil {
		t.Errorf("Abort() of an abandoned game by a stranger = %v, want nil", err)
	}
}

func TestMissingMatchesAndGames(t *testing.T) {
	l, _ := newLeague(t)
	if _, err := l.Match(ctx, "missing"); !errors.Is(err, league.ErrNotFound) {
		t.Errorf("Match() = %v", err)
	}
	if _, err := l.Game(ctx, "missing"); !errors.Is(err, league.ErrNotFound) {
		t.Errorf("Game() = %v", err)
	}
	if _, err := l.Score(ctx, "missing", "a", stranger); !errors.Is(err, league.ErrNotFound) {
		t.Errorf("Score() = %v", err)
	}
	if _, err := l.Undo(ctx, "missing", stranger); !errors.Is(err, league.ErrNotFound) {
		t.Errorf("Undo() = %v", err)
	}
	if _, _, err := l.Rematch(ctx, "missing", "1-10"); !errors.Is(err, league.ErrNotFound) {
		t.Errorf("Rematch() = %v", err)
	}
}

// The ranking keeps the league's formula: a win rate shrinks toward the
// average as if the player had played 20 more matches at it, and each
// match counts once per participant. One 1-10 match won by blue gives
// (4 + 20 * 0.5) / (4 + 20) to blue and 10 / 24 to red. Running matches
// count once they end.
func TestRanking(t *testing.T) {
	l, _ := newLeague(t)
	m, token := start(t, l, "1-10", "a", "b", "c", "d")
	score(t, l, m, token, m.Players[0], 10)

	running, runningToken := start(t, l, "1-10", "e", "f", "g", "h")
	score(t, l, running, runningToken, running.Players[0], 3)

	ranks, err := l.Ranking(ctx)
	if err != nil {
		t.Fatal(err)
	}
	rate := map[string]float64{}
	for _, r := range ranks {
		rate[r.Name] = r.Winrate
	}
	want := map[string]float64{
		m.Players[0]: 58.3, m.Players[1]: 58.3, m.Players[2]: 41.7, m.Players[3]: 41.7,
		"e": 0, "f": 0, "g": 0, "h": 0,
	}
	for name, w := range want {
		if rate[name] != w {
			t.Errorf("%s: win rate %v, want %v", name, rate[name], w)
		}
	}
	if !slices.IsSortedFunc(ranks, func(a, b league.Rank) int { return cmp.Compare(b.Winrate, a.Winrate) }) {
		t.Errorf("ranking isn't ordered by win rate: %v", ranks)
	}
}

// A new game puts the two players with the best win rates on different
// teams.
func TestTeamsSplitTheBestPlayers(t *testing.T) {
	l, _ := newLeague(t)
	m, token := start(t, l, "1-10", "a", "b", "c", "d")
	score(t, l, m, token, m.Players[0], 10)
	best := m.Players[:2]

	for range 10 {
		next, _ := start(t, l, "1-10", "a", "b", "c", "d")
		blue := next.Players[:2]
		if slices.Contains(blue, best[0]) == slices.Contains(blue, best[1]) {
			t.Fatalf("the best players %v play on one team: %v", best, next.Players)
		}
	}
}

func TestRematch(t *testing.T) {
	l, _ := newLeague(t)
	m, token := start(t, l, "1-10", "a", "b", "c", "d")
	score(t, l, m, token, m.Players[0], 10)

	rematch, rematchToken, err := l.Rematch(ctx, m.GameID, "3-5")
	if err != nil {
		t.Fatal(err)
	}
	sorted := rematch.Players
	slices.Sort(sorted[:])
	if rematch.GameID == m.GameID || rematch.Mode != "3-5" || rematch.Location != m.Location || sorted != (seats{"a", "b", "c", "d"}) {
		t.Errorf("rematch %+v", rematch)
	}
	if rematchToken == token || !l.MayChange(ctx, rematch.GameID, rematchToken) {
		t.Error("the rematch doesn't have its own token")
	}
}

func TestLists(t *testing.T) {
	l, _ := newLeague(t)
	first, token := start(t, l, "1-10", "a", "b", "c", "d")
	score(t, l, first, token, first.Players[0], 10)
	second, _ := start(t, l, "1-10", "e", "f", "g", "h")

	live, err := l.Live(ctx)
	if err != nil || len(live) != 1 || live[0].ID != second.ID {
		t.Errorf("Live() = %v, %v, want the second game", live, err)
	}
	if total, err := l.Matches(ctx); err != nil || total != 2 {
		t.Errorf("Matches() = %d, %v, want 2", total, err)
	}
	history, err := l.History(ctx, 0, 10)
	if err != nil || len(history) != 2 || history[0].ID != second.ID || history[1].ID != first.ID {
		t.Errorf("History() = %v, %v, want newest first", history, err)
	}
	if page, err := l.History(ctx, 1, 10); err != nil || len(page) != 1 || page[0].ID != first.ID {
		t.Errorf("History(1, 10) = %v, %v, want the first game alone", page, err)
	}
	running, err := l.Running(ctx)
	if err != nil || len(running) != 1 || running[0].ID != second.ID {
		t.Errorf("Running() = %v, %v, want the second game's match", running, err)
	}
}
