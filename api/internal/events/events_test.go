package events

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/segmentio/kafka-go"
)

type flakyWriter struct{ failures, calls int }

func (f *flakyWriter) WriteMessages(_ context.Context, _ ...kafka.Message) error {
	f.calls++
	if f.calls <= f.failures {
		return errors.New("broker down")
	}
	return nil
}
func (f *flakyWriter) Close() error { return nil }

// A batch must survive a Kafka outage far longer than the old 3-attempt limit.
func TestWriteRetriesUntilKafkaRecovers(t *testing.T) {
	w := &flakyWriter{failures: 10}
	p := &Producer{writer: w, backoff: func(int) time.Duration { return time.Millisecond }}
	p.write([]kafka.Message{{}, {}, {}})
	if p.Sent.Load() != 3 || p.Dropped.Load() != 0 || w.calls != 11 {
		t.Fatalf("sent=%d dropped=%d calls=%d", p.Sent.Load(), p.Dropped.Load(), w.calls)
	}
}

func TestWriteGivesUpOnShutdown(t *testing.T) {
	w := &flakyWriter{failures: 1 << 30}
	p := &Producer{writer: w, backoff: func(int) time.Duration { return time.Millisecond }}
	p.closing.Store(true)
	p.write([]kafka.Message{{}, {}})
	if p.Dropped.Load() != 2 || w.calls != 3 {
		t.Fatalf("dropped=%d calls=%d", p.Dropped.Load(), w.calls)
	}
}

func TestParseUA(t *testing.T) {
	cases := []struct{ ua, device, browser, os string }{
		{"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "mobile", "Safari", "iOS"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0", "desktop", "Edge", "Windows"},
		{"Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0", "desktop", "Firefox", "Linux"},
		{"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36", "mobile", "Chrome", "Android"},
		{"Googlebot/2.1", "bot", "Other", "Other"},
	}
	for _, c := range cases {
		d, b, o := ParseUA(c.ua)
		if d != c.device || b != c.browser || o != c.os {
			t.Errorf("%q => %s/%s/%s want %s/%s/%s", c.ua, d, b, o, c.device, c.browser, c.os)
		}
	}
}

func TestRefHost(t *testing.T) {
	if refHost("") != "direct" || refHost("https://www.Google.com/search?q=x") != "google.com" || refHost("::bad") != "direct" {
		t.Fatal("refHost")
	}
}

func TestEmitNeverBlocks(t *testing.T) {
	p := &Producer{ch: make(chan Raw, 2)}
	for i := 0; i < 5; i++ {
		p.Emit(Raw{Code: "x"})
	}
	if p.Dropped.Load() != 3 {
		t.Fatalf("dropped=%d want 3", p.Dropped.Load())
	}
}
