package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/nca-apprentices/ncaleague/trace"
	"github.com/nca-apprentices/ncaleague/web"
)

// collector takes what the exporter posts, as the OpenTelemetry
// Collector would.
type collector struct {
	srv  *httptest.Server
	mu   sync.Mutex
	body []byte
}

func newCollector(t *testing.T) *collector {
	t.Helper()
	c := &collector{}
	c.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		c.mu.Lock()
		defer c.mu.Unlock()
		if r.URL.Path != "/v1/traces" || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("POST %s with %s, want /v1/traces as JSON", r.URL.Path, r.Header.Get("Content-Type"))
		}
		c.body = append(c.body, body...)
	}))
	t.Cleanup(c.srv.Close)
	return c
}

// spans returns the spans posted so far, by name.
func (c *collector) spans(t *testing.T) map[string]map[string]any {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	spans := map[string]map[string]any{}
	dec := json.NewDecoder(bytes.NewReader(c.body))
	for dec.More() {
		var payload struct {
			ResourceSpans []struct {
				Resource struct {
					Attributes []struct {
						Key   string
						Value struct{ StringValue string }
					}
				}
				ScopeSpans []struct{ Spans []map[string]any }
			}
		}
		if err := dec.Decode(&payload); err != nil {
			t.Fatal(err)
		}
		for _, rs := range payload.ResourceSpans {
			if a := rs.Resource.Attributes; len(a) != 1 || a[0].Key != "service.name" || a[0].Value.StringValue != "ncaleague-test" {
				t.Errorf("resource attributes %v, want the service name", a)
			}
			for _, ss := range rs.ScopeSpans {
				for _, s := range ss.Spans {
					spans[s["name"].(string)] = s
				}
			}
		}
	}
	return spans
}

// A request is a server span named by its route, each statement under
// it a client span, and the log lines carry the trace's ID.
func TestRequestsAreTraced(t *testing.T) {
	s := newSite(t)
	c := newCollector(t)
	exporter := trace.Export(c.srv.URL, "ncaleague-test")

	var logs bytes.Buffer
	slog.SetDefault(slog.New(web.Logs(slog.NewJSONHandler(&logs, nil))))
	t.Cleanup(func() { slog.SetDefault(slog.New(slog.DiscardHandler)) })

	req, _ := http.NewRequest(http.MethodGet, s.srv.URL+"/ranking", nil)
	req.Header.Set("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
	res, err := s.browser().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	s.get(s.browser(), "/health")
	exporter.Stop()

	spans := c.spans(t)
	page := spans["GET /ranking"]
	if page == nil {
		t.Fatalf("spans %v lack the request", spans)
	}
	if page["traceId"] != "0af7651916cd43dd8448eb211c80319c" || page["parentSpanId"] != "b7ad6b7169203331" {
		t.Errorf("request span %v doesn't join the caller's trace", page)
	}
	if page["kind"] != float64(trace.Server) || page["status"].(map[string]any)["code"] != float64(0) {
		t.Errorf("request span %v, want a server span without error", page)
	}
	query := spans["SELECT"]
	if query == nil || query["traceId"] != page["traceId"] || query["parentSpanId"] != page["spanId"] || query["kind"] != float64(trace.Client) {
		t.Errorf("statement span %v, want a client span under the request", query)
	}
	for name := range spans {
		if strings.Contains(name, "health") {
			t.Errorf("the health probe is traced: %s", name)
		}
	}

	line := logs.String()
	if !strings.Contains(line, `"path":"/ranking"`) || !strings.Contains(line, `"trace_id":"0af7651916cd43dd8448eb211c80319c"`) || !strings.Contains(line, `"span_id":"`) {
		t.Errorf("request log lacks the trace: %s", line)
	}
}

// Without an exporter, spans still give the logs their trace IDs.
func TestLogsCarryTheTraceWithoutAnExporter(t *testing.T) {
	s := newSite(t)
	var logs bytes.Buffer
	slog.SetDefault(slog.New(web.Logs(slog.NewJSONHandler(&logs, nil))))
	t.Cleanup(func() { slog.SetDefault(slog.New(slog.DiscardHandler)) })

	s.get(s.browser(), "/games")
	if line := logs.String(); !strings.Contains(line, `"trace_id":"`) {
		t.Errorf("request log lacks a trace ID: %s", line)
	}
}
