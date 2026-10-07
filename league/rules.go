package league

import (
	"cmp"
	"fmt"
	"log/slog"
	"math"
	"math/rand/v2"
	"regexp"
	"slices"
	"time"
	"uuid"
)

// A game: four players, two teams, a few matches. Blue and red each field
// an offense and a defense, and a match ends when a team reaches the
// mode's goals. The players change seats between matches.

// Match is one match of a game.
type Match struct {
	ID, GameID string
	Location   string
	// Mode, such as 4-5, plays four matches, each to five goals.
	Mode string
	// Start is in UTC.
	Start time.Time
	// Players sit as blue offense, blue defense, red offense, and red
	// defense.
	Players [4]string
	// Number is the match's place in its game, from 1.
	Number int
	// Scorers lists who scored each goal, in order.
	Scorers []string
	Done    bool
}

// Seat is a player with their goals in a match.
type Seat struct {
	Name  string
	Score int
}

// Rank is a player with their win rate in percent.
type Rank struct {
	Name    string
	Winrate float64
}

const (
	// After this long without a goal or a new match, anyone may abort a
	// game, so a lost browser can't keep it live.
	abandonedAfter = time.Hour

	// A win rate shrinks toward the league average as if the player had
	// played this many more matches at the average, so a few lucky wins
	// don't top the ranking.
	priorMatches = 20
)

var (
	locations = []string{"Zurich", "Winterthur"}
	modes     = []string{"4-5", "3-5", "1-10"}
	// Names are short signs, such as ab.
	validName = regexp.MustCompile(`^[\p{L}\p{N}._-]{1,32}$`)
)

// Seats pairs each player with their goals.
func (m Match) Seats() [4]Seat {
	var s [4]Seat
	for i, name := range m.Players {
		s[i] = Seat{name, count(m.Scorers, name)}
	}
	return s
}

// Score returns the goals of each team.
func (m Match) Score() (blue, red int) {
	s := m.Seats()
	return s[0].Score + s[1].Score, s[2].Score + s[3].Score
}

// Total returns the number of matches the game plays.
func (m Match) Total() int {
	matches, _ := m.rules()
	return matches
}

// Winner returns blue or red for a finished match and "" otherwise.
func (m Match) Winner() string {
	blue, red := m.Score()
	switch {
	case !m.Done:
		return ""
	case blue > red:
		return "blue"
	default:
		return "red"
	}
}

// Winners returns the players of a game who won the most of its matches,
// in the order they sat in its first match. Players change teams between
// matches, so a game's winner is a player, not a team.
func Winners(game []Match) []string {
	wins := map[string]int{}
	most := 0
	for _, m := range game {
		won := m.Players[:0]
		switch m.Winner() {
		case "blue":
			won = m.Players[:2]
		case "red":
			won = m.Players[2:]
		}
		for _, name := range won {
			wins[name]++
			most = max(most, wins[name])
		}
	}

	var winners []string
	if len(game) == 0 || most == 0 {
		return winners
	}
	for _, name := range game[0].Players {
		if wins[name] == most {
			winners = append(winners, name)
		}
	}
	return winners
}

// Over says the game ends with this match, now finished.
func (m Match) Over() bool {
	return m.Done && m.Number >= m.Total()
}

// LogValue shows a match in the logs: which game, where, and how it
// stands.
func (m Match) LogValue() slog.Value {
	blue, red := m.Score()
	return slog.GroupValue(
		slog.String("game", m.GameID),
		slog.String("id", m.ID),
		slog.String("location", m.Location),
		slog.String("mode", m.Mode),
		slog.Int("number", m.Number),
		slog.String("score", fmt.Sprintf("%d:%d", blue, red)),
		slog.Any("blue", m.Players[:2]),
		slog.Any("red", m.Players[2:]),
	)
}

func (m Match) rules() (matches, goals int) {
	fmt.Sscanf(m.Mode, "%d-%d", &matches, &goals)
	return matches, goals
}

func (m Match) finished() bool {
	blue, red := m.Score()
	_, goals := m.rules()
	return blue >= goals || red >= goals
}

// next is the match that follows m, with the players in their new seats.
func next(m Match) Match {
	return Match{
		ID:       uuid.NewV4().String(),
		GameID:   m.GameID,
		Location: m.Location,
		Mode:     m.Mode,
		Start:    now(),
		Players:  rotate(m.Players, m.Number),
		Number:   m.Number + 1,
	}
}

// rotate moves the players to their seats for the next match, given the
// seats of the game's latest match and the number of matches played.
func rotate(p [4]string, played int) [4]string {
	switch played {
	case 1:
		return [4]string{p[2], p[0], p[1], p[3]}
	case 3:
		return [4]string{p[3], p[1], p[0], p[2]}
	default:
		return [4]string{p[3], p[0], p[1], p[2]}
	}
}

// ranking orders the players by win rate over their records, by the
// formula the league has always used.
func ranking(names []string, records []record) []Rank {
	var sum float64
	byName := map[string]record{}
	for _, r := range records {
		sum += float64(r.wins) / float64(r.played)
		byName[r.name] = r
	}
	average := sum / float64(max(len(records), 1))

	ranks := make([]Rank, len(names))
	for i, name := range names {
		ranks[i].Name = name
		if r, ok := byName[name]; ok {
			rate := (float64(r.wins) + priorMatches*average) / float64(r.played+priorMatches)
			ranks[i].Winrate = math.Round(rate*100*10) / 10
		}
	}
	slices.SortStableFunc(ranks, func(a, b Rank) int { return cmp.Compare(b.Winrate, a.Winrate) })
	return ranks
}

// teams gives each team one of the two players with the best win rates
// and one of the other two, at random positions.
func teams(names [4]string, ranks []Rank) [4]string {
	rate := map[string]float64{}
	for _, r := range ranks {
		rate[r.Name] = r.Winrate
	}
	sorted := names
	slices.SortStableFunc(sorted[:], func(a, b string) int { return cmp.Compare(rate[b], rate[a]) })

	best1, best2 := shuffled(sorted[0], sorted[1])
	other1, other2 := shuffled(sorted[2], sorted[3])
	blueOffense, blueDefense := shuffled(best1, other1)
	redOffense, redDefense := shuffled(best2, other2)
	return [4]string{blueOffense, blueDefense, redOffense, redDefense}
}

func shuffled(a, b string) (string, string) {
	if rand.IntN(2) == 0 {
		return b, a
	}
	return a, b
}

func abandoned(lastActivity, now time.Time) bool {
	return now.Sub(lastActivity) >= abandonedAfter
}

// now returns the time in UTC, which the timestamp columns hold.
func now() time.Time {
	return time.Now().UTC()
}

func count(names []string, name string) int {
	n := 0
	for _, s := range names {
		if s == name {
			n++
		}
	}
	return n
}
