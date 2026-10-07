// Package trace records what the app does as OpenTelemetry spans and
// sends them over OTLP/HTTP, with nothing beyond the standard library. A
// request is a server span, each statement under it a client span, and
// the log lines written meanwhile carry the trace's ID.
package trace

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// Kind says which side of a call a span is, by OpenTelemetry's numbers.
type Kind int

const (
	Server Kind = 2
	Client Kind = 3
)

// Span is one timed step of a trace.
type Span struct {
	traceID    [16]byte
	id, parent [8]byte
	name       string
	kind       Kind
	start, end time.Time
	attributes []attribute
	failed     bool
	// remote marks the span a caller sent in a traceparent header, which
	// the caller exports.
	remote bool
}

type attribute struct {
	key   string
	value any
}

type spanKey struct{}

// Start begins a span under the one in ctx, or a new trace, and returns
// the context the span's children start from.
func Start(ctx context.Context, name string, kind Kind) (context.Context, *Span) {
	s := &Span{name: name, kind: kind, start: time.Now()}
	if parent, ok := ctx.Value(spanKey{}).(*Span); ok {
		s.traceID, s.parent = parent.traceID, parent.id
	} else {
		rand.Read(s.traceID[:])
	}
	rand.Read(s.id[:])
	return context.WithValue(ctx, spanKey{}, s), s
}

// Parent continues the trace a traceparent header names, so the request's
// spans join the caller's trace. A header it can't read starts a new one.
func Parent(ctx context.Context, traceparent string) context.Context {
	parts := strings.Split(traceparent, "-")
	if len(parts) != 4 || len(parts[1]) != 32 || len(parts[2]) != 16 {
		return ctx
	}
	s := &Span{remote: true}
	if _, err := hex.Decode(s.traceID[:], []byte(parts[1])); err != nil {
		return ctx
	}
	if _, err := hex.Decode(s.id[:], []byte(parts[2])); err != nil {
		return ctx
	}
	return context.WithValue(ctx, spanKey{}, s)
}

// IDs returns the trace and span IDs of the span in ctx as hex.
func IDs(ctx context.Context) (traceID, spanID string, ok bool) {
	s, ok := ctx.Value(spanKey{}).(*Span)
	if !ok {
		return "", "", false
	}
	return hex.EncodeToString(s.traceID[:]), hex.EncodeToString(s.id[:]), true
}

// Rename names the span once its name is known, such as a request's route.
func (s *Span) Rename(name string) {
	s.name = name
}

// Set adds an attribute: a string, an int, or a bool.
func (s *Span) Set(key string, value any) {
	s.attributes = append(s.attributes, attribute{key, value})
}

// Fail marks the span as failed.
func (s *Span) Fail() {
	s.failed = true
}

// End finishes the span and hands it to the exporter.
func (s *Span) End() {
	s.end = time.Now()
	if e := exporter.Load(); e != nil {
		e.add(s)
	}
}

// The exporter the ended spans go to. nil leaves them unsent, and the
// trace IDs still reach the logs.
var exporter atomic.Pointer[Exporter]

// Exporter batches the ended spans and posts them to an OTLP/HTTP
// endpoint.
type Exporter struct {
	endpoint, service string
	spans             chan *Span
	done              chan struct{}
}

const (
	batchSize  = 512
	batchEvery = 3 * time.Second
	queueSize  = 4096
	sendIn     = 5 * time.Second
)

// Export sends the spans that end from now on to the OTLP/HTTP endpoint,
// such as http://telemetry:4318, as the named service. Stop sends the
// last of them.
func Export(endpoint, service string) *Exporter {
	e := &Exporter{
		endpoint: strings.TrimSuffix(endpoint, "/") + "/v1/traces",
		service:  service,
		spans:    make(chan *Span, queueSize),
		done:     make(chan struct{}),
	}
	exporter.Store(e)
	go e.run()
	return e
}

// Stop sends the spans left and stops exporting.
func (e *Exporter) Stop() {
	exporter.CompareAndSwap(e, nil)
	close(e.spans)
	<-e.done
}

// add queues a span, or drops it when the queue is full, so a slow
// endpoint never slows the app.
func (e *Exporter) add(s *Span) {
	if s.remote {
		return
	}
	select {
	case e.spans <- s:
	default:
	}
}

func (e *Exporter) run() {
	defer close(e.done)
	ticker := time.NewTicker(batchEvery)
	defer ticker.Stop()

	var batch []*Span
	for {
		select {
		case s, ok := <-e.spans:
			if !ok {
				e.send(batch)
				return
			}
			batch = append(batch, s)
			if len(batch) < batchSize {
				continue
			}
		case <-ticker.C:
		}
		e.send(batch)
		batch = nil
	}
}

func (e *Exporter) send(batch []*Span) {
	if len(batch) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), sendIn)
	defer cancel()
	body, _ := json.Marshal(e.payload(batch))
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, e.endpoint, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("traces not sent", "endpoint", e.endpoint, "err", err.Error())
		return
	}
	res.Body.Close()
	if res.StatusCode >= http.StatusMultipleChoices {
		slog.Warn("traces refused", "endpoint", e.endpoint, "status", res.StatusCode)
	}
}

// The OTLP/JSON encoding of a batch, from the OpenTelemetry protocol. IDs
// are hex, times are nanoseconds since the epoch, and status code 2 is an
// error.
type (
	payload struct {
		ResourceSpans []resourceSpans `json:"resourceSpans"`
	}
	resourceSpans struct {
		Resource   attributes   `json:"resource"`
		ScopeSpans []scopeSpans `json:"scopeSpans"`
	}
	attributes struct {
		Attributes []keyValue `json:"attributes"`
	}
	scopeSpans struct {
		Scope scope  `json:"scope"`
		Spans []span `json:"spans"`
	}
	scope struct {
		Name string `json:"name"`
	}
	span struct {
		TraceID      string     `json:"traceId"`
		SpanID       string     `json:"spanId"`
		ParentSpanID string     `json:"parentSpanId,omitempty"`
		Name         string     `json:"name"`
		Kind         Kind       `json:"kind"`
		Start        string     `json:"startTimeUnixNano"`
		End          string     `json:"endTimeUnixNano"`
		Attributes   []keyValue `json:"attributes,omitempty"`
		Status       status     `json:"status"`
	}
	keyValue struct {
		Key   string `json:"key"`
		Value value  `json:"value"`
	}
	value struct {
		String *string `json:"stringValue,omitempty"`
		Int    *string `json:"intValue,omitempty"`
		Bool   *bool   `json:"boolValue,omitempty"`
	}
	status struct {
		Code int `json:"code"`
	}
)

const statusError = 2

func (e *Exporter) payload(batch []*Span) payload {
	spans := make([]span, len(batch))
	for i, s := range batch {
		spans[i] = span{
			TraceID: hex.EncodeToString(s.traceID[:]),
			SpanID:  hex.EncodeToString(s.id[:]),
			Name:    s.name,
			Kind:    s.kind,
			Start:   strconv.FormatInt(s.start.UnixNano(), 10),
			End:     strconv.FormatInt(s.end.UnixNano(), 10),
		}
		if s.parent != [8]byte{} {
			spans[i].ParentSpanID = hex.EncodeToString(s.parent[:])
		}
		for _, a := range s.attributes {
			spans[i].Attributes = append(spans[i].Attributes, encode(a))
		}
		if s.failed {
			spans[i].Status.Code = statusError
		}
	}
	return payload{[]resourceSpans{{
		Resource:   attributes{[]keyValue{encode(attribute{"service.name", e.service})}},
		ScopeSpans: []scopeSpans{{scope{"ncaleague"}, spans}},
	}}}
}

func encode(a attribute) keyValue {
	kv := keyValue{Key: a.key}
	switch v := a.value.(type) {
	case string:
		kv.Value.String = &v
	case int:
		n := strconv.Itoa(v)
		kv.Value.Int = &n
	case bool:
		kv.Value.Bool = &v
	}
	return kv
}
