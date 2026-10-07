// Package web serves the league as pages and the forms they post. The
// pages work without JavaScript, and static/app.js adds what HTML can't.
package web

import (
	"crypto/sha256"
	"embed"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"
	"unicode"

	"github.com/nca-apprentices/ncaleague/league"
)

// Handler serves the league. The navigation bar shows version.
func Handler(l *league.League, version string) http.Handler {
	s := site{l, version}
	mux := http.NewServeMux()
	mux.Handle("GET /static/", assets())
	mux.HandleFunc("GET /speculation-rules", speculationRules)
	mux.HandleFunc("GET /health", s.health)

	mux.HandleFunc("GET /{$}", s.page("new", s.newGame))
	mux.HandleFunc("GET /live", s.page("live", s.live))
	mux.HandleFunc("GET /live/boards", s.boards)
	mux.HandleFunc("GET /matches/{id}", s.page("match", s.match))
	mux.HandleFunc("GET /games/{id}/summary", s.page("summary", s.summary))
	mux.HandleFunc("GET /ranking", s.page("ranking", s.ranking))
	mux.HandleFunc("GET /games", s.page("games", s.games))

	mux.HandleFunc("POST /games", action(s.start))
	mux.HandleFunc("POST /games/{id}/rematch", action(s.rematch))
	mux.HandleFunc("POST /matches/{id}/goals", action(s.goal))
	mux.HandleFunc("POST /matches/{id}/undo", action(s.undo))
	mux.HandleFunc("POST /matches/{id}/abort", action(s.abort))
	return logRequests(secure(http.NewCrossOriginProtection().Handler(mux)))
}

type site struct {
	l       *league.League
	version string
}

func (s site) health(w http.ResponseWriter, r *http.Request) {
	if err := s.l.Ping(r.Context()); err != nil {
		slog.ErrorContext(r.Context(), "database unreachable", "err", err.Error())
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Write([]byte("ok"))
}

func (s site) newGame(r *http.Request) (any, error) {
	return s.l.Players(r.Context())
}

func (s site) live(r *http.Request) (any, error) {
	return s.followed(r)
}

// boards renders only the running games, which the Live page polls.
func (s site) boards(w http.ResponseWriter, r *http.Request) {
	games, err := s.followed(r)
	if err != nil {
		fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := pages["live"].ExecuteTemplate(w, "boards", games); err != nil {
		slog.ErrorContext(r.Context(), "render failed", "page", "boards", "err", err.Error())
	}
}

// followed is a running game as the Live page shows it: the match being
// played, and the game's matches before it.
type followed struct {
	league.Match
	Blue, Red         int
	BlueTeam, RedTeam []league.Seat
	LastGoal          string
	Minutes           int
	Before            []result
}

type result struct {
	Number, Blue, Red int
	Winner            string
}

func (s site) followed(r *http.Request) ([]followed, error) {
	ms, err := s.l.Running(r.Context())
	if err != nil {
		return nil, err
	}
	var order []string
	byGame := map[string][]league.Match{}
	for _, m := range ms {
		if _, seen := byGame[m.GameID]; !seen {
			order = append(order, m.GameID)
		}
		byGame[m.GameID] = append(byGame[m.GameID], m)
	}

	games := make([]followed, 0, len(order))
	for _, id := range order {
		game := byGame[id]
		m := game[len(game)-1]
		seats := m.Seats()
		f := followed{
			Match:    m,
			BlueTeam: seats[:2],
			RedTeam:  seats[2:],
			Minutes:  int(time.Since(m.Start).Minutes()),
		}
		f.Blue, f.Red = m.Score()
		if n := len(m.Scorers); n > 0 {
			f.LastGoal = m.Scorers[n-1]
		}
		for _, before := range game[:min(m.Number-1, len(game))] {
			blue, red := before.Score()
			f.Before = append(f.Before, result{before.Number, blue, red, before.Winner()})
		}
		games = append(games, f)
	}
	return games, nil
}

func (s site) match(r *http.Request) (any, error) {
	m, err := s.l.Match(r.Context(), r.PathValue("id"))
	if err != nil {
		return nil, err
	}
	b := newBoard(m)
	b.Owner = s.l.MayChange(r.Context(), m.GameID, cookies(r)(m.GameID))
	return b, nil
}

func (s site) summary(r *http.Request) (any, error) {
	game, err := s.l.Game(r.Context(), r.PathValue("id"))
	return map[string]any{"Matches": game, "Winners": league.Winners(game)}, err
}

// ranking lists the players a page at a time. First is the index of
// the page's first player, so the ranks count on across pages.
func (s site) ranking(r *http.Request) (any, error) {
	ranks, err := s.l.Ranking(r.Context())
	if err != nil {
		return nil, err
	}
	p := paginate(r, "ranking", len(ranks))
	return map[string]any{"Rows": ranks[p.From:p.To], "First": p.From, "Paging": p}, nil
}

// games lists the matches newest first, a page at a time, and shades
// every other game on the page.
func (s site) games(r *http.Request) (any, error) {
	total, err := s.l.Matches(r.Context())
	if err != nil {
		return nil, err
	}
	p := paginate(r, "games", total)
	ms, err := s.l.History(r.Context(), p.From, p.Rows)
	if err != nil {
		return nil, err
	}

	type row struct {
		league.Match
		Shaded bool
	}
	rows := make([]row, len(ms))
	shaded := false
	for i, m := range ms {
		if i > 0 && m.GameID != ms[i-1].GameID {
			shaded = !shaded
		}
		rows[i] = row{m, shaded}
	}
	return map[string]any{"Rows": rows, "Paging": p}, nil
}

// A list shows as many rows as the browser's screen has room for. The
// script measures the room and keeps the count in a cookie per list, so
// the pages need no scrolling on a kiosk of any size.
const (
	defaultRows = 20
	maxRows     = 100
	rowsCookie  = "rows-"
)

// paging is the page of a list the request asks for. Prev and Next are
// 0 where there is no such page.
type paging struct {
	Name                   string
	From, To               int
	Rows, Page, Prev, Next int
	Numbers                []int
}

func paginate(r *http.Request, name string, total int) paging {
	rows := defaultRows
	if c, err := r.Cookie(rowsCookie + name); err == nil {
		if n, err := strconv.Atoi(c.Value); err == nil {
			rows = min(max(n, 1), maxRows)
		}
	}

	pages := max((total+rows-1)/rows, 1)
	n, _ := strconv.Atoi(r.URL.Query().Get("page"))
	n = min(max(n, 1), pages)
	next := n + 1
	if n == pages {
		next = 0
	}
	return paging{
		Name: name,
		From: (n - 1) * rows, To: min(n*rows, total),
		Rows: rows, Page: n, Prev: n - 1, Next: next,
		Numbers: pageNumbers(n, pages),
	}
}

// pageNumbers lists the pages to link: all of them up to nine, and beyond
// that the first, the last, and the current page with its neighbors. A 0
// stands for the pages left out between.
func pageNumbers(page, pages int) []int {
	if pages < 10 {
		numbers := make([]int, pages)
		for i := range numbers {
			numbers[i] = i + 1
		}
		return numbers
	}

	numbers := []int{1}
	if page > 3 {
		numbers = append(numbers, 0)
	}
	for n := max(2, page-1); n <= min(pages-1, page+1); n++ {
		numbers = append(numbers, n)
	}
	if page < pages-2 {
		numbers = append(numbers, 0)
	}
	return append(numbers, pages)
}

// start starts a game of the names typed, split at commas and spaces.
func (s site) start(w http.ResponseWriter, r *http.Request) (string, error) {
	names := strings.FieldsFunc(r.FormValue("name"), func(c rune) bool { return c == ',' || unicode.IsSpace(c) })
	m, token, err := s.l.Start(r.Context(), names, r.FormValue("location"), r.FormValue("gameMode"))
	return handOver(w, m, token, err)
}

func (s site) rematch(w http.ResponseWriter, r *http.Request) (string, error) {
	m, token, err := s.l.Rematch(r.Context(), r.PathValue("id"), r.FormValue("newGameMode"))
	return handOver(w, m, token, err)
}

func (s site) goal(w http.ResponseWriter, r *http.Request) (string, error) {
	m, err := s.l.Score(r.Context(), r.PathValue("id"), r.FormValue("player"), cookies(r))
	return show(m), err
}

func (s site) undo(w http.ResponseWriter, r *http.Request) (string, error) {
	m, err := s.l.Undo(r.Context(), r.PathValue("id"), cookies(r))
	return show(m), err
}

func (s site) abort(w http.ResponseWriter, r *http.Request) (string, error) {
	return "/", s.l.Abort(r.Context(), r.PathValue("id"), cookies(r))
}

// show is where the game goes on: the match, or the summary once the game
// is over.
func show(m league.Match) string {
	if m.Over() {
		return "/games/" + m.GameID + "/summary"
	}
	return "/matches/" + m.ID
}

// The browser keeps a game's token in a cookie that only this origin sends
// and no script reads. It outlives any game.
const (
	tokenCookie = "__Host-game-"
	tokenMaxAge = 24 * time.Hour
)

// handOver gives the browser that started a game its token.
func handOver(w http.ResponseWriter, m league.Match, token string, err error) (string, error) {
	if err != nil {
		return "", err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     tokenCookie + m.GameID,
		Value:    token,
		Path:     "/",
		MaxAge:   int(tokenMaxAge.Seconds()),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})
	return show(m), nil
}

func cookies(r *http.Request) league.Tokens {
	return func(gameID string) string {
		c, err := r.Cookie(tokenCookie + gameID)
		if err != nil {
			return ""
		}
		return c.Value
	}
}

// page renders the template with what load returns. A match or game that
// doesn't exist, such as an aborted one, sends the browser to New Game.
func (s site) page(name string, load func(*http.Request) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := load(r)
		if errors.Is(err, league.ErrNotFound) {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		if err != nil {
			fail(w, r, err)
			return
		}
		live, err := s.l.Live(r.Context())
		if err != nil {
			fail(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Speculation-Rules", `"/speculation-rules"`)
		v := view{Path: r.URL.Path, Version: s.version, Running: len(live) > 0, Data: data}
		err = pages[name].Execute(w, v)
		if err != nil {
			slog.ErrorContext(r.Context(), "render failed", "page", name, "err", err.Error())
		}
	}
}

// action runs a change and sends the browser to the page it returns.
func action(do func(http.ResponseWriter, *http.Request) (string, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		to, err := do(w, r)
		if err != nil {
			fail(w, r, err)
			return
		}
		http.Redirect(w, r, to, http.StatusSeeOther)
	}
}

// fail answers with the status the error calls for. A 400 says what was
// wrong, and a 500 logs the cause and says nothing.
func fail(w http.ResponseWriter, r *http.Request, err error) {
	code := http.StatusInternalServerError
	switch {
	case errors.Is(err, league.ErrInvalid):
		code = http.StatusBadRequest
	case errors.Is(err, league.ErrForbidden):
		code = http.StatusForbidden
	case errors.Is(err, league.ErrNotFound):
		code = http.StatusNotFound
	default:
		slog.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "err", err.Error())
	}

	msg := http.StatusText(code)
	if code == http.StatusBadRequest {
		msg = err.Error()
	}
	http.Error(w, msg, code)
}

// Browsers prerender the pages behind links as the pointer nears them, so
// they open at once. A match changes too often to prerender.
func speculationRules(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/speculationrules+json")
	w.Write([]byte(`{"prerender": [{"where": {"and": [{"href_matches": "/*"}, {"not": {"href_matches": "/matches/*"}}]}, "eagerness": "moderate"}]}`))
}

// board is a match as its scoreboard shows it.
type board struct {
	league.Match
	Blue, Red int
	// Tiles lists the seats as the table shows them, blue defense first.
	Tiles []tile
	// Owner says the browser may change the game.
	Owner bool
}

type tile struct {
	league.Seat
	Team string
}

func newBoard(m league.Match) board {
	s := m.Seats()
	blue, red := m.Score()
	return board{
		Match: m, Blue: blue, Red: red,
		Tiles: []tile{{s[1], "blue"}, {s[2], "red"}, {s[0], "blue"}, {s[3], "red"}},
	}
}

// The binary carries the pages: templates, and in static what the browser
// loads as it is.
var (
	//go:embed templates static
	files     embed.FS
	static, _ = fs.Sub(files, "static")
)

// versions maps each static file to a hash of its content. The pages link
// a file with its hash, so browsers may cache it for good and fetch it
// again only once it changes.
var versions = func() map[string]string {
	versions := map[string]string{}
	fs.WalkDir(static, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		content, err := fs.ReadFile(static, name)
		versions[name] = fmt.Sprintf("%x", sha256.Sum256(content))[:12]
		return err
	})
	return versions
}()

func staticURL(name string) string {
	return "/static/" + name + "?v=" + versions[name]
}

func assets() http.Handler {
	files := http.StripPrefix("/static", http.FileServerFS(static))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		files.ServeHTTP(w, r)
	})
}

// The league plays in Zurich, so the pages show its time.
var zurich, _ = time.LoadLocation("Europe/Zurich")

// pages holds each page as the layout around the page's main block.
var pages = func() map[string]*template.Template {
	layout := template.Must(template.New("layout.html").Funcs(template.FuncMap{
		"static": staticURL,
		"upper":  strings.ToUpper,
		"add":    func(a, b int) int { return a + b },
		"date":   func(t time.Time) string { return t.In(zurich).Format("02/01/2006, 15:04") },
		// seat names the seat, counted from blue offense, as the tables
		// head their columns.
		"seat": func(i int) string {
			return []string{"Blue Offensive", "Blue Defensive", "Red Offensive", "Red Defensive"}[i]
		},
		// won says whether the player in the seat, counted from blue
		// offense, won the match.
		"won": func(m league.Match, seat int) bool {
			return m.Winner() == "blue" && seat < 2 || m.Winner() == "red" && seat >= 2
		},
	}).ParseFS(files, "templates/layout.html", "templates/parts.html"))

	pages := map[string]*template.Template{}
	for _, name := range []string{"new", "live", "match", "summary", "ranking", "games"} {
		pages[name] = template.Must(template.Must(layout.Clone()).ParseFS(files, "templates/"+name+".html"))
	}
	return pages
}()

// view is what the layout renders: the page's data and, for the
// navigation bar, the path and the version.
type view struct {
	Path, Version string
	// Running says a game is live, which the navigation bar shows.
	Running bool
	Data    any
}
