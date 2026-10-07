package tests

import (
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/nca-apprentices/ncaleague/web"
)

// site serves a fresh league over TLS, as the ingress does, so browsers
// keep the token's Secure cookie.
type site struct {
	t   *testing.T
	srv *httptest.Server
}

func newSite(t *testing.T) site {
	t.Helper()
	l, _ := newLeague(t)
	srv := httptest.NewTLSServer(web.Handler(l, "v1.2.3"))
	t.Cleanup(srv.Close)
	return site{t, srv}
}

// browser is a client with its own cookies that sees redirects instead of
// following them.
func (s site) browser() *http.Client {
	jar, _ := cookiejar.New(nil)
	c := *s.srv.Client()
	c.Jar = jar
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &c
}

type page struct {
	status int
	header http.Header
	body   string
}

func (s site) get(c *http.Client, path string) page {
	s.t.Helper()
	res, err := c.Get(s.srv.URL + path)
	if err != nil {
		s.t.Fatal(err)
	}
	return read(s.t, res)
}

func (s site) post(c *http.Client, path string, form url.Values) page {
	s.t.Helper()
	res, err := c.PostForm(s.srv.URL+path, form)
	if err != nil {
		s.t.Fatal(err)
	}
	return read(s.t, res)
}

func read(t *testing.T, res *http.Response) page {
	t.Helper()
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return page{res.StatusCode, res.Header, string(body)}
}

// start starts a game through New Game and returns the match page.
func (s site) start(c *http.Client, names string) string {
	s.t.Helper()
	p := s.post(c, "/games", url.Values{"location": {"Winterthur"}, "gameMode": {"1-10"}, "name": {names}})
	if p.status != http.StatusSeeOther || !strings.HasPrefix(p.header.Get("Location"), "/matches/") {
		s.t.Fatalf("POST /games = %d %q", p.status, p.header.Get("Location"))
	}
	return p.header.Get("Location")
}

func TestPagesRender(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	match := s.start(c, "ab, cd, ef, gh")
	var last page
	for range 10 {
		last = s.post(c, match+"/goals", url.Values{"player": {"ab"}})
	}
	summary := last.header.Get("Location")

	for _, tt := range []struct{ path, want string }{
		{"/", "<h1>New Game</h1>"},
		{"/ranking", "<h1>Ranking</h1>"},
		{"/games", "<h1>Games</h1>"},
		{summary, "<h1>Game Over</h1>"},
		{match, "Match 1 of 1"},
	} {
		p := s.get(c, tt.path)
		if p.status != http.StatusOK || !strings.Contains(p.body, tt.want) {
			t.Errorf("GET %s = %d, missing %q", tt.path, p.status, tt.want)
		}
		if !strings.Contains(p.header.Get("Content-Type"), "text/html") {
			t.Errorf("GET %s: Content-Type %q", tt.path, p.header.Get("Content-Type"))
		}
	}
}

func TestPagesKeepToThisOrigin(t *testing.T) {
	s := newSite(t)
	p := s.get(s.browser(), "/")
	for header, want := range map[string]string{
		"Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
		"X-Content-Type-Options":  "nosniff",
		"Referrer-Policy":         "no-referrer",
	} {
		if got := p.header.Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
	if !regexp.MustCompile(`^[0-9a-f-]{36}$`).MatchString(p.header.Get("X-Request-Id")) {
		t.Errorf("X-Request-Id = %q, want a UUID", p.header.Get("X-Request-Id"))
	}
}

func TestFormsFromOtherSitesAreRefused(t *testing.T) {
	s := newSite(t)
	req, _ := http.NewRequest(http.MethodPost, s.srv.URL+"/games", strings.NewReader("name=a,b,c,d&location=Zurich&gameMode=1-10"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	res, err := s.browser().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Errorf("cross-site POST = %d, want 403", res.StatusCode)
	}
}

func TestTheStartingBrowserKeepsTheToken(t *testing.T) {
	s := newSite(t)
	owner := s.browser()
	p := s.post(owner, "/games", url.Values{"location": {"Zurich"}, "gameMode": {"1-10"}, "name": {"Ab Cd,ef  gh"}})
	if p.status != http.StatusSeeOther {
		t.Fatalf("POST /games = %d %s", p.status, p.body)
	}
	cookie := p.header.Get("Set-Cookie")
	for _, want := range []string{"__Host-game-", "Path=/", "HttpOnly", "Secure", "SameSite=Strict"} {
		if !strings.Contains(cookie, want) {
			t.Errorf("Set-Cookie %q lacks %q", cookie, want)
		}
	}
	match := p.header.Get("Location")

	viewer := s.browser()
	if p := s.get(viewer, match); !strings.Contains(p.body, "Only the device that started this game can change it.") || strings.Contains(p.body, "Undo Goal") {
		t.Error("a viewer sees the controls")
	}
	for _, action := range []string{"/goals", "/undo", "/abort"} {
		if p := s.post(viewer, match+action, url.Values{"player": {"ab"}}); p.status != http.StatusForbidden {
			t.Errorf("viewer POST %s = %d, want 403", action, p.status)
		}
	}

	if p := s.post(owner, match+"/goals", url.Values{"player": {"ab"}}); p.status != http.StatusSeeOther || p.header.Get("Location") != match {
		t.Errorf("owner goal = %d %q", p.status, p.header.Get("Location"))
	}
	if p := s.get(owner, match); !strings.Contains(p.body, "Undo Goal") || !regexp.MustCompile(`<h1>(1 : 0|0 : 1)</h1>`).MatchString(p.body) {
		t.Error("the owner's scoreboard doesn't show the goal and the controls")
	}
}

func TestInputTheAppDoesntExpectIsRefused(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	for _, form := range []url.Values{
		{"location": {"Zurich"}, "gameMode": {"1-10"}, "name": {"a, b, c"}},
		{"location": {"Zurich"}, "gameMode": {"1-10"}, "name": {"a, b, c, <b>"}},
		{"location": {"Mars"}, "gameMode": {"1-10"}, "name": {"a, b, c, d"}},
		{"location": {"Zurich"}, "gameMode": {"2-7"}, "name": {"a, b, c, d"}},
		{"location": {"Zurich"}, "gameMode": {"1-10"}, "name": {strings.Repeat("x", 10_000)}},
	} {
		if p := s.post(c, "/games", form); p.status != http.StatusBadRequest {
			t.Errorf("POST /games %v = %d, want 400", form, p.status)
		}
	}

	match := s.start(c, "a, b, c, d")
	if p := s.post(c, match+"/goals", url.Values{"player": {"e"}}); p.status != http.StatusBadRequest {
		t.Errorf("goal for a player outside the match = %d, want 400", p.status)
	}
}

func TestMissingMatchesSendTheBrowserToNewGame(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	for _, path := range []string{"/matches/missing", "/games/missing/summary"} {
		if p := s.get(c, path); p.status != http.StatusSeeOther || p.header.Get("Location") != "/" {
			t.Errorf("GET %s = %d %q, want a redirect to /", path, p.status, p.header.Get("Location"))
		}
	}
	if p := s.post(c, "/matches/missing/abort", nil); p.status != http.StatusSeeOther {
		t.Errorf("abort of a missing match = %d, want 303", p.status)
	}
	if p := s.get(c, "/missing"); p.status != http.StatusNotFound {
		t.Errorf("GET /missing = %d, want 404", p.status)
	}
}

func TestAbortReturnsToNewGame(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	match := s.start(c, "a, b, c, d")
	if p := s.post(c, match+"/abort", nil); p.status != http.StatusSeeOther || p.header.Get("Location") != "/" {
		t.Errorf("abort = %d %q", p.status, p.header.Get("Location"))
	}
	if p := s.get(c, match); p.header.Get("Location") != "/" {
		t.Error("the aborted match still shows")
	}
}

func TestTheLastGoalShowsTheSummary(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	match := s.start(c, "a, b, c, d")
	var p page
	for range 10 {
		p = s.post(c, match+"/goals", url.Values{"player": {"a"}})
	}
	summary := p.header.Get("Location")
	if !regexp.MustCompile(`^/games/[0-9a-f-]+/summary$`).MatchString(summary) {
		t.Fatalf("the last goal sends to %q", summary)
	}
	// a scored every goal, so a's team won.
	body := s.get(c, summary).body
	if !strings.Contains(body, "Game Over") || !strings.Contains(body, `<td class="name won">A</td>`) {
		t.Error("the summary doesn't list the match with its winners in bold")
	}
	if !regexp.MustCompile(`Won by (A and [BCD]|[BCD] and A)\b`).MatchString(body) {
		t.Error("the summary doesn't name the game's winners")
	}

	rematch := s.post(c, strings.TrimSuffix(summary, "/summary")+"/rematch", url.Values{"newGameMode": {"3-5"}})
	if rematch.status != http.StatusSeeOther || !strings.HasPrefix(rematch.header.Get("Location"), "/matches/") {
		t.Errorf("rematch = %d %q", rematch.status, rematch.header.Get("Location"))
	}
	if p := s.get(c, rematch.header.Get("Location")); !strings.Contains(p.body, "Match 1 of 3") || !strings.Contains(p.body, "Undo Goal") {
		t.Error("the rematch isn't the browser's new game")
	}
}

func TestGamesListPagesBy20(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	for range 21 {
		s.start(c, "a, b, c, d")
	}
	first := s.get(c, "/games").body
	if n := strings.Count(first, "<td>1-10</td>"); n != 20 {
		t.Errorf("page 1 lists %d matches, want 20", n)
	}
	if !strings.Contains(first, `<a href="?page=2">Next</a>`) || strings.Contains(first, "Previous") {
		t.Error("page 1 doesn't link only the next page")
	}
	second := s.get(c, "/games?page=2").body
	if n := strings.Count(second, "<td>1-10</td>"); n != 1 || !strings.Contains(second, `<a href="?page=1">Previous</a>`) {
		t.Errorf("page 2 lists %d matches or misses Previous", n)
	}
}

// The script tells the server how many rows fit the screen in a cookie
// per list.
func TestListsShowTheRowsThatFit(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	for range 6 {
		s.start(c, "a, b, c, d")
	}
	u, _ := url.Parse(s.srv.URL)
	c.Jar.SetCookies(u, []*http.Cookie{{Name: "rows-games", Value: "5"}, {Name: "rows-ranking", Value: "3"}})

	games := s.get(c, "/games").body
	if n := strings.Count(games, "<td data-label=\"Mode\">"); n != 5 || !strings.Contains(games, `data-rows="5"`) || !strings.Contains(games, `<a href="?page=2">Next</a>`) {
		t.Errorf("page 1 lists %d matches, want 5 and a next page", n)
	}
	ranking := s.get(c, "/ranking").body
	if n := strings.Count(ranking, `<td class="name">`); n != 3 || !strings.Contains(ranking, `<a href="?page=2">Next</a>`) {
		t.Errorf("page 1 ranks %d players, want 3 and a next page", n)
	}
	if second := s.get(c, "/ranking?page=2").body; !strings.Contains(second, "<td>4</td>") {
		t.Error("page 2 doesn't go on with rank 4")
	}
}

func TestStaticFilesAreCachedForGood(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	script := regexp.MustCompile(`/static/app\.js\?v=[0-9a-f]{12}`).FindString(s.get(c, "/").body)
	if script == "" {
		t.Fatal("New Game doesn't link the script by its content")
	}
	p := s.get(c, script)
	if p.status != http.StatusOK || p.header.Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Errorf("GET %s = %d, Cache-Control %q", script, p.status, p.header.Get("Cache-Control"))
	}
	if p := s.get(c, "/static/new.html"); p.status != http.StatusNotFound {
		t.Errorf("GET /static/new.html = %d, want the templates out of reach", p.status)
	}
}

func TestLiveFollowsTheRunningGames(t *testing.T) {
	s := newSite(t)
	c := s.browser()
	if body := s.get(c, "/live").body; !strings.Contains(body, "No games are running.") || strings.Contains(body, "on-air-dot") {
		t.Error("Live shows games before any runs")
	}

	match := s.start(c, "a, b, c, d")
	s.post(c, match+"/goals", url.Values{"player": {"a"}})
	page := s.get(c, "/live").body
	for _, want := range []string{"<h1>Live Games</h1>", `href="` + match + `"`, "Winterthur", "Match 1 of 1", "Last goal: A", "on-air-dot"} {
		if !strings.Contains(page, want) {
			t.Errorf("Live lacks %q", want)
		}
	}

	p := s.get(c, "/live/boards")
	if p.status != http.StatusOK || p.header.Get("Cache-Control") != "no-store" {
		t.Errorf("GET /live/boards = %d, Cache-Control %q", p.status, p.header.Get("Cache-Control"))
	}
	if strings.Contains(p.body, "<html") || !regexp.MustCompile(`data-score="(1:0|0:1)"`).MatchString(p.body) {
		t.Errorf("GET /live/boards isn't the boards alone: %q", p.body)
	}
}

func TestHealth(t *testing.T) {
	s := newSite(t)
	if p := s.get(s.browser(), "/health"); p.status != http.StatusOK || p.body != "ok" {
		t.Errorf("GET /health = %d %q", p.status, p.body)
	}
}
