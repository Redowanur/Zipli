package server

import (
	"testing"

	"shorturl/internal/config"
)

func TestIsSelfAndNormalize(t *testing.T) {
	s := &Server{cfg: &config.Config{BaseURL: "https://sho.rt"}}
	if !s.isSelf("https://sho.rt/abc") || !s.isSelf("https://SHO.RT/x") {
		t.Fatal("own host must be rejected")
	}
	if s.isSelf("https://example.com/sho.rt") {
		t.Fatal("other hosts must pass")
	}
	for in, ok := range map[string]bool{
		"example.com/a": true, "http://x.y": true, "ftp://x.y": false,
		"javascript:alert(1)": false, "": false, "https://": false,
	} {
		if _, err := normalizeURL(in); (err == nil) != ok {
			t.Errorf("normalizeURL(%q) ok=%v want %v", in, err == nil, ok)
		}
	}
}

func TestAllowedDays(t *testing.T) {
	cases := []struct {
		plan string
		req  int
		want int
	}{
		{"free", 30, 7}, {"free", 3, 3}, {"free", 0, 1},
		{"pro", 365, 90}, {"pro", 30, 30},
		{"business", 1000, 365}, {"enterprise", 365, 365},
		{"unknown-plan", 90, 7}, // unknown plans get the free window
	}
	for _, c := range cases {
		if got := allowedDays(c.plan, c.req); got != c.want {
			t.Errorf("allowedDays(%s,%d)=%d want %d", c.plan, c.req, got, c.want)
		}
	}
}
