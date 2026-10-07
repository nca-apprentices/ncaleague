package tests

import (
	"slices"
	"testing"

	"github.com/nca-apprentices/ncaleague/league"
)

func TestMatchScore(t *testing.T) {
	m := league.Match{Players: seats{"bo", "bd", "ro", "rd"}, Scorers: []string{"bo", "rd", "bd", "bo", "nobody"}}

	blue, red := m.Score()
	if blue != 3 || red != 1 {
		t.Errorf("Score() = %d:%d, want 3:1", blue, red)
	}
	want := [4]league.Seat{{Name: "bo", Score: 2}, {Name: "bd", Score: 1}, {Name: "ro", Score: 0}, {Name: "rd", Score: 1}}
	if got := m.Seats(); got != want {
		t.Errorf("Seats() = %v, want %v", got, want)
	}
}

func TestMatchWinner(t *testing.T) {
	tests := []struct {
		name    string
		scorers []string
		done    bool
		want    string
	}{
		{"running", []string{"ro", "ro"}, false, ""},
		{"blue won", []string{"bo", "ro", "bd"}, true, "blue"},
		{"red won", []string{"bo", "ro", "rd"}, true, "red"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := league.Match{Players: seats{"bo", "bd", "ro", "rd"}, Scorers: tt.scorers, Done: tt.done}
			if got := m.Winner(); got != tt.want {
				t.Errorf("Winner() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestMatchOver(t *testing.T) {
	tests := []struct {
		mode   string
		number int
		done   bool
		want   bool
	}{
		{"1-10", 1, false, false},
		{"1-10", 1, true, true},
		{"3-5", 2, true, false},
		{"3-5", 3, true, true},
		{"4-5", 4, true, true},
	}
	for _, tt := range tests {
		m := league.Match{Mode: tt.mode, Number: tt.number, Done: tt.done}
		if got := m.Over(); got != tt.want {
			t.Errorf("Match{Mode: %s, Number: %d, Done: %t}.Over() = %t, want %t", tt.mode, tt.number, tt.done, got, tt.want)
		}
	}
}

func TestWinners(t *testing.T) {
	won := func(players seats, winner int) league.Match {
		return league.Match{Mode: "3-5", Players: players, Done: true, Scorers: []string{players[winner]}}
	}
	tests := []struct {
		name string
		game []league.Match
		want []string
	}{
		{"no matches", nil, nil},
		{"a running match", []league.Match{{Players: seats{"a", "b", "c", "d"}}}, nil},
		{"one match", []league.Match{won(seats{"a", "b", "c", "d"}, 2)}, []string{"c", "d"}},
		{"most matches", []league.Match{
			won(seats{"a", "b", "c", "d"}, 0),
			won(seats{"c", "a", "b", "d"}, 0),
			won(seats{"d", "c", "a", "b"}, 2),
		}, []string{"a"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := league.Winners(tt.game); !slices.Equal(got, tt.want) {
				t.Errorf("Winners() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestMatchTotal(t *testing.T) {
	for mode, want := range map[string]int{"4-5": 4, "3-5": 3, "1-10": 1} {
		if got := (league.Match{Mode: mode}).Total(); got != want {
			t.Errorf("Total() for %s = %d, want %d", mode, got, want)
		}
	}
}
