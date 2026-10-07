package web

import (
	"context"
	"log/slog"
	"net/http"
	"time"
	"uuid"

	"github.com/nca-apprentices/ncaleague/trace"
)

const (
	// Forms carry four names at most, so a few kilobytes are plenty.
	maxBody = 4 << 10

	// The pages load only from this origin, never inside a frame, and
	// submit forms only to it.
	contentSecurityPolicy = "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)

// secure sets the headers that keep the pages to this origin and caps the
// request body.
func secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		next.ServeHTTP(w, r)
	})
}

type requestIDKey struct{}

// logRequests gives every request an ID, which every log line about it
// carries, serves it in a span under the caller's trace, and logs one
// line per request. The probes call health every few seconds, so it
// stays out of both.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		id := uuid.NewV4().String()
		w.Header().Set("X-Request-Id", id)
		ctx := context.WithValue(r.Context(), requestIDKey{}, id)
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		ctx, span := trace.Start(trace.Parent(ctx, r.Header.Get("traceparent")), r.Method, trace.Server)
		defer span.End()
		span.Set("http.request.method", r.Method)
		span.Set("url.path", r.URL.Path)
		r = r.WithContext(ctx)

		rec := &recorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		// The mux names the route on the request as it serves it.
		if r.Pattern != "" {
			span.Rename(r.Pattern)
			span.Set("http.route", r.Pattern)
		}
		span.Set("http.response.status_code", rec.status)
		if rec.status >= http.StatusInternalServerError {
			span.Fail()
		}
		slog.InfoContext(r.Context(), "request", "method", r.Method, "path", r.URL.Path,
			"status", rec.status, "durationMs", time.Since(start).Milliseconds())
	})
}

type recorder struct {
	http.ResponseWriter
	status int
}

func (r *recorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Logs wraps a log handler so the lines written while serving a request
// carry its ID and its trace's, which links a line to its trace.
func Logs(h slog.Handler) slog.Handler {
	return requestLogs{h}
}

type requestLogs struct{ slog.Handler }

func (h requestLogs) Handle(ctx context.Context, r slog.Record) error {
	if id, ok := ctx.Value(requestIDKey{}).(string); ok {
		r.AddAttrs(slog.String("requestId", id))
	}
	if traceID, spanID, ok := trace.IDs(ctx); ok {
		r.AddAttrs(slog.String("trace_id", traceID), slog.String("span_id", spanID))
	}
	return h.Handler.Handle(ctx, r)
}

func (h requestLogs) WithAttrs(attrs []slog.Attr) slog.Handler {
	return requestLogs{h.Handler.WithAttrs(attrs)}
}

func (h requestLogs) WithGroup(name string) slog.Handler {
	return requestLogs{h.Handler.WithGroup(name)}
}
