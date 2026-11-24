// Package analytics queries click statistics from ClickHouse over its HTTP API.
package analytics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"shorturl/internal/config"
)

type Client struct {
	cfg  config.ClickHouse
	http *http.Client
}

func New(cfg config.ClickHouse) *Client {
	return &Client{cfg: cfg, http: &http.Client{Timeout: 10 * time.Second}}
}

type Bucket struct {
	Key    string `json:"key"`
	Clicks uint64 `json:"clicks"`
}

type Stats struct {
	Code           string   `json:"code"`
	Days           int      `json:"days"`
	RetentionDays  int      `json:"retention_days"`
	TotalClicks    uint64   `json:"total_clicks"`
	UniqueVisitors uint64   `json:"unique_visitors"`
	Timeseries     []Bucket `json:"timeseries"`
	Referrers      []Bucket `json:"referrers"`
	Countries      []Bucket `json:"countries"`
	Devices        []Bucket `json:"devices"`
	Browsers       []Bucket `json:"browsers"`
	OS             []Bucket `json:"os"`
}

func (c *Client) Ping(ctx context.Context) error {
	_, err := c.query(ctx, "SELECT 1", nil)
	return err
}

// query runs a parameterised SELECT (FORMAT JSON) and returns the data rows.
func (c *Client) query(ctx context.Context, sql string, params map[string]string) ([]map[string]any, error) {
	q := url.Values{}
	q.Set("database", c.cfg.DB)
	q.Set("default_format", "JSON")
	q.Set("output_format_json_quote_64bit_integers", "0")
	for k, v := range params {
		q.Set("param_"+k, v)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.URL+"/?"+q.Encode(), stringsReader(sql))
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-ClickHouse-User", c.cfg.User)
	if c.cfg.Password != "" {
		req.Header.Set("X-ClickHouse-Key", c.cfg.Password)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("clickhouse %d: %s", resp.StatusCode, string(body))
	}
	var out struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return out.Data, nil
}

func num(v any) uint64 {
	switch t := v.(type) {
	case float64:
		return uint64(t)
	case string:
		n, _ := strconv.ParseUint(t, 10, 64)
		return n
	}
	return 0
}

const window = "code = {code:String} AND ts >= now() - INTERVAL {days:UInt32} DAY"

func (c *Client) top(ctx context.Context, col, code string, days int) ([]Bucket, error) {
	// col comes from a fixed internal list, never from user input.
	rows, err := c.query(ctx,
		"SELECT "+col+" AS k, count() AS c FROM clicks WHERE "+window+" GROUP BY k ORDER BY c DESC LIMIT 10",
		map[string]string{"code": code, "days": strconv.Itoa(days)})
	if err != nil {
		return nil, err
	}
	out := make([]Bucket, 0, len(rows))
	for _, r := range rows {
		out = append(out, Bucket{Key: fmt.Sprint(r["k"]), Clicks: num(r["c"])})
	}
	return out, nil
}

func (c *Client) LinkStats(ctx context.Context, code string, days int) (*Stats, error) {
	p := map[string]string{"code": code, "days": strconv.Itoa(days)}
	s := &Stats{Code: code, Days: days}

	rows, err := c.query(ctx, "SELECT count() AS c, uniq(visitor) AS u FROM clicks WHERE "+window, p)
	if err != nil {
		return nil, err
	}
	if len(rows) == 1 {
		s.TotalClicks, s.UniqueVisitors = num(rows[0]["c"]), num(rows[0]["u"])
	}

	rows, err = c.query(ctx,
		"SELECT toString(toDate(ts)) AS k, count() AS c FROM clicks WHERE "+window+" GROUP BY k ORDER BY k", p)
	if err != nil {
		return nil, err
	}
	s.Timeseries = make([]Bucket, 0, len(rows))
	for _, r := range rows {
		s.Timeseries = append(s.Timeseries, Bucket{Key: fmt.Sprint(r["k"]), Clicks: num(r["c"])})
	}

	for col, dst := range map[string]*[]Bucket{
		"referrer": &s.Referrers, "country": &s.Countries, "device": &s.Devices,
		"browser": &s.Browsers, "os": &s.OS,
	} {
		if *dst, err = c.top(ctx, col, code, days); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// Overview aggregates clicks across several links (a user's whole account).
type Overview struct {
	Days           int               `json:"days"`
	RetentionDays  int               `json:"retention_days"`
	TotalClicks    uint64            `json:"total_clicks"`
	UniqueVisitors uint64            `json:"unique_visitors"`
	Timeseries     []Bucket          `json:"timeseries"`
	ByLink         map[string]uint64 `json:"by_link"`
}

// codeList renders codes as a ClickHouse Array(String) literal. Codes were
// validated as [0-9A-Za-z_-] on creation, so no quoting hazards exist; the
// guard below keeps that invariant local rather than assumed.
func codeList(codes []string) (string, bool) {
	var b strings.Builder
	b.WriteByte('[')
	for i, c := range codes {
		if strings.ContainsAny(c, `'"\,[] `) {
			return "", false
		}
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString("'" + c + "'")
	}
	b.WriteByte(']')
	return b.String(), true
}

func (c *Client) AccountOverview(ctx context.Context, codes []string, days int) (*Overview, error) {
	o := &Overview{Days: days, Timeseries: []Bucket{}, ByLink: map[string]uint64{}}
	if len(codes) == 0 {
		return o, nil
	}
	list, ok := codeList(codes)
	if !ok {
		return nil, fmt.Errorf("unsafe code in list")
	}
	p := map[string]string{"codes": list, "days": strconv.Itoa(days)}
	const w = "code IN {codes:Array(String)} AND ts >= now() - INTERVAL {days:UInt32} DAY"

	rows, err := c.query(ctx, "SELECT count() AS c, uniq(visitor) AS u FROM clicks WHERE "+w, p)
	if err != nil {
		return nil, err
	}
	if len(rows) == 1 {
		o.TotalClicks, o.UniqueVisitors = num(rows[0]["c"]), num(rows[0]["u"])
	}
	if rows, err = c.query(ctx, "SELECT toString(toDate(ts)) AS k, count() AS c FROM clicks WHERE "+w+" GROUP BY k ORDER BY k", p); err != nil {
		return nil, err
	}
	for _, r := range rows {
		o.Timeseries = append(o.Timeseries, Bucket{Key: fmt.Sprint(r["k"]), Clicks: num(r["c"])})
	}
	if rows, err = c.query(ctx, "SELECT code AS k, count() AS c FROM clicks WHERE "+w+" GROUP BY k", p); err != nil {
		return nil, err
	}
	for _, r := range rows {
		o.ByLink[fmt.Sprint(r["k"])] = num(r["c"])
	}
	return o, nil
}
