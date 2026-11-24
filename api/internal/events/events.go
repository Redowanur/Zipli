// Package events ships click events to Kafka without ever blocking a redirect.
//
// Emit is a non-blocking channel send. A background worker enriches events
// (user-agent parsing), batches them and writes to Kafka with retries. If
// Kafka is down the bounded buffer fills and further events are dropped (and
// counted) rather than slowing the redirect.
package events

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/segmentio/kafka-go"
)

// Raw is what the redirect handler captures: cheap string copies only.
type Raw struct {
	Code      string
	TS        time.Time
	IP        string
	UserAgent string
	Referer   string
	Country   string
}

// Click is the wire format; it matches the ClickHouse clicks_queue table.
type Click struct {
	TS       int64  `json:"ts"`
	Code     string `json:"code"`
	Visitor  string `json:"visitor"`
	Country  string `json:"country"`
	Referrer string `json:"referrer"`
	Device   string `json:"device"`
	Browser  string `json:"browser"`
	OS       string `json:"os"`
}

// msgWriter is the subset of *kafka.Writer the producer needs (fakeable in tests).
type msgWriter interface {
	WriteMessages(ctx context.Context, msgs ...kafka.Message) error
	Close() error
}

type Producer struct {
	ch      chan Raw
	writer  msgWriter
	salt    string
	wg      sync.WaitGroup
	closing atomic.Bool
	backoff func(attempt int) time.Duration
	Dropped atomic.Int64
	Sent    atomic.Int64
}

const (
	bufferSize   = 20000
	maxBatch     = 500
	flushEvery   = 100 * time.Millisecond
	writeTimeout = 3 * time.Second
	// While Kafka is down the worker keeps retrying the same batch (new events
	// queue in the buffer). A batch is abandoned only after this long.
	maxRetryWindow = 10 * time.Minute
)

func NewProducer(brokers []string, topic, salt string) *Producer {
	p := &Producer{
		ch:      make(chan Raw, bufferSize),
		salt:    salt,
		backoff: defaultBackoff,
		writer: &kafka.Writer{
			Addr:                   kafka.TCP(brokers...),
			Topic:                  topic,
			Balancer:               &kafka.Hash{},
			RequiredAcks:           kafka.RequireOne,
			BatchTimeout:           20 * time.Millisecond,
			AllowAutoTopicCreation: true,
		},
	}
	p.wg.Add(1)
	go p.run()
	return p
}

// Emit never blocks. Returns false if the event was dropped.
func (p *Producer) Emit(r Raw) bool {
	select {
	case p.ch <- r:
		return true
	default:
		p.Dropped.Add(1)
		return false
	}
}

// Close drains the buffer (best effort) and closes the writer.
func (p *Producer) Close() {
	p.closing.Store(true)
	close(p.ch)
	p.wg.Wait()
	p.writer.Close()
}

func (p *Producer) run() {
	defer p.wg.Done()
	batch := make([]kafka.Message, 0, maxBatch)
	tick := time.NewTicker(flushEvery)
	defer tick.Stop()
	flush := func() {
		if len(batch) == 0 {
			return
		}
		p.write(batch)
		batch = batch[:0]
	}
	for {
		select {
		case r, ok := <-p.ch:
			if !ok {
				flush()
				return
			}
			if m, ok := p.encode(r); ok {
				batch = append(batch, m)
			}
			if len(batch) >= maxBatch {
				flush()
			}
		case <-tick.C:
			flush()
		}
	}
}

func defaultBackoff(attempt int) time.Duration {
	d := 200 * time.Millisecond << min(attempt, 5) // 200ms .. 6.4s
	return min(d, 5*time.Second)
}

// write retries a batch until Kafka accepts it. Redirects are never affected:
// they only touch the channel, which drops (and counts) on overflow.
func (p *Producer) write(batch []kafka.Message) {
	deadline := time.Now().Add(maxRetryWindow)
	var err error
	for attempt := 0; ; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
		err = p.writer.WriteMessages(ctx, batch...)
		cancel()
		if err == nil {
			p.Sent.Add(int64(len(batch)))
			return
		}
		// On shutdown, don't hang forever: a couple of tries, then give up.
		if (p.closing.Load() && attempt >= 2) || time.Now().After(deadline) {
			break
		}
		if attempt == 0 {
			slog.Warn("kafka unavailable, retrying", "n", len(batch), "err", err)
		}
		time.Sleep(p.backoff(attempt))
	}
	p.Dropped.Add(int64(len(batch)))
	slog.Error("kafka write failed, batch dropped", "n", len(batch), "err", err)
}

func (p *Producer) encode(r Raw) (kafka.Message, bool) {
	device, browser, os := ParseUA(r.UserAgent)
	sum := sha256.Sum256([]byte(p.salt + "|" + r.IP + "|" + r.UserAgent))
	country := strings.ToUpper(r.Country)
	if len(country) != 2 {
		country = "XX"
	}
	b, err := json.Marshal(Click{
		TS: r.TS.Unix(), Code: r.Code, Visitor: hex.EncodeToString(sum[:8]),
		Country: country, Referrer: refHost(r.Referer),
		Device: device, Browser: browser, OS: os,
	})
	if err != nil {
		return kafka.Message{}, false
	}
	return kafka.Message{Key: []byte(r.Code), Value: b}, true
}

func refHost(ref string) string {
	if ref == "" {
		return "direct"
	}
	u, err := url.Parse(ref)
	if err != nil || u.Hostname() == "" {
		return "direct"
	}
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
}
