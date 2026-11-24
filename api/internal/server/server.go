// Package server wires the HTTP API and the redirect hot path.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/sync/singleflight"

	"shorturl/internal/analytics"
	"shorturl/internal/cache"
	"shorturl/internal/config"
	"shorturl/internal/events"
	"shorturl/internal/shortcode"
	"shorturl/internal/store"
)

// Links a user may hold per plan.
var planLimits = map[string]int{"free": 25, "pro": 1000, "business": 10000, "enterprise": 1 << 30}

// Analytics history (days) a plan may query. ClickHouse also drops rows after
// 365 days (TTL in deploy/clickhouse/init.sql).
var planRetention = map[string]int{"free": 7, "pro": 90, "business": 365, "enterprise": 365}

// allowedDays clamps a requested window to what the plan includes.
func allowedDays(plan string, requested int) int {
	max, ok := planRetention[plan]
	if !ok {
		max = planRetention["free"]
	}
	return clamp(requested, 1, max)
}

type Server struct {
	cfg    *config.Config
	db     *store.Store
	cache  *cache.Cache
	events *events.Producer
	stats  *analytics.Client
	sf     singleflight.Group
}

func New(cfg *config.Config, db *store.Store, c *cache.Cache, ev *events.Producer, an *analytics.Client) *Server {
	return &Server{cfg: cfg, db: db, cache: c, events: ev, stats: an}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(recoverer, accessLog)

	r.Get("/healthz", s.health)
	r.Get("/readyz", s.ready)

	r.Route("/api", func(r chi.Router) {
		r.Post("/links/public", s.createPublicLink) // guest shortening, no login
		r.Post("/auth/register", s.register)
		r.Post("/auth/login", s.login)
		r.Get("/auth/google", s.googleStart)
		r.Get("/auth/google/callback", s.googleCallback)
		r.Group(func(r chi.Router) {
			r.Use(s.auth)
			r.Get("/me", s.me)
			r.Post("/links", s.createLink)
			r.Get("/links", s.listLinks)
			r.Delete("/links/{code}", s.deleteLink)
			r.Patch("/links/{code}", s.patchLink)
			r.Get("/links/{code}/stats", s.linkStats)
			r.Get("/stats/overview", s.overview)
		})
	})

	r.Get("/{code}", s.redirect)
	r.Head("/{code}", s.redirect)
	return r
}

// ---------- redirect hot path ----------

func (s *Server) redirect(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	target, ok := s.resolve(r.Context(), code)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if r.Method == http.MethodGet {
		s.events.Emit(events.Raw{
			Code: code, TS: time.Now(), IP: clientIP(r),
			UserAgent: r.UserAgent(), Referer: r.Referer(),
			Country: firstNonEmpty(r.Header.Get("CF-IPCountry"), r.Header.Get("X-Geo-Country")),
		})
	}
	// 302 (not 301) so browsers don't cache the hop and skip click tracking.
	w.Header().Set("Cache-Control", "private, max-age=0")
	http.Redirect(w, r, target, http.StatusFound)
}

// resolve: Redis -> Postgres -> backfill. Concurrent misses for one code share
// a single Postgres query.
func (s *Server) resolve(ctx context.Context, code string) (string, bool) {
	if !shortcode.ValidAlias(code) {
		return "", false
	}
	if u, hit, notFound := s.cache.Get(ctx, code); hit {
		return u, !notFound
	}
	v, _, _ := s.sf.Do(code, func() (any, error) {
		target, expires, disabled, err := s.db.Resolve(ctx, code)
		switch {
		case errors.Is(err, store.ErrNotFound):
			s.cache.SetNegative(ctx, code)
			return "", nil
		case err != nil:
			slog.Error("resolve", "code", code, "err", err)
			return "", nil
		case disabled || (expires != nil && time.Now().After(*expires)):
			s.cache.SetNegative(ctx, code)
			return "", nil
		}
		s.cache.Set(ctx, code, target, expires)
		return target, nil
	})
	t, _ := v.(string)
	return t, t != ""
}

// ---------- auth ----------

type ctxKey struct{}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if !decode(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if !strings.Contains(in.Email, "@") || len(in.Email) > 254 || len(in.Password) < 8 || len(in.Password) > 72 {
		writeErr(w, 400, "valid email and a password of 8-72 characters are required")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), 10)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	u, err := s.db.CreateUser(r.Context(), in.Email, string(hash))
	if errors.Is(err, store.ErrConflict) {
		writeErr(w, 409, "email already registered")
		return
	} else if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	s.issueToken(w, u, 201)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if !decode(w, r, &in) {
		return
	}
	u, err := s.db.UserByEmail(r.Context(), strings.ToLower(strings.TrimSpace(in.Email)))
	if err != nil || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		writeErr(w, 401, "invalid email or password")
		return
	}
	s.issueToken(w, u, 200)
}

func (s *Server) issueToken(w http.ResponseWriter, u *store.User, status int) {
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(u.ID, 10),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	writeJSON(w, status, map[string]any{"token": tok, "user": u})
}

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		raw := strings.TrimPrefix(h, "Bearer ")
		if raw == h || raw == "" {
			writeErr(w, 401, "missing bearer token")
			return
		}
		var claims jwt.RegisteredClaims
		_, err := jwt.ParseWithClaims(raw, &claims, func(*jwt.Token) (any, error) {
			return []byte(s.cfg.JWTSecret), nil
		}, jwt.WithValidMethods([]string{"HS256"}))
		id, perr := strconv.ParseInt(claims.Subject, 10, 64)
		if err != nil || perr != nil {
			writeErr(w, 401, "invalid token")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
	})
}

func uid(r *http.Request) int64 { return r.Context().Value(ctxKey{}).(int64) }

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := s.db.UserByID(r.Context(), uid(r))
	if err != nil {
		writeErr(w, 401, "unknown user")
		return
	}
	writeJSON(w, 200, map[string]any{"user": u, "link_limit": planLimits[u.Plan], "retention_days": allowedDays(u.Plan, 1<<20)})
}

// ---------- links ----------

type createReq struct {
	URL       string  `json:"url"`
	Alias     string  `json:"alias"`
	ExpiresAt *string `json:"expires_at"`
}

type linkView struct {
	store.Link
	ShortURL string `json:"short_url"`
}

func (s *Server) view(l store.Link) linkView { return linkView{l, s.cfg.BaseURL + "/" + l.Code} }

func (s *Server) createLink(w http.ResponseWriter, r *http.Request) {
	var in createReq
	if !decode(w, r, &in) {
		return
	}
	target, err := normalizeURL(in.URL)
	if err == nil && s.isSelf(target) {
		err = errSelf
	}
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if in.Alias != "" && !shortcode.ValidAlias(in.Alias) {
		writeErr(w, 400, "alias must be 3-32 chars of letters, digits, '-' or '_' and not a reserved word")
		return
	}
	var exp *time.Time
	if in.ExpiresAt != nil && *in.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *in.ExpiresAt)
		if err != nil || !t.After(time.Now()) {
			writeErr(w, 400, "expires_at must be a future RFC3339 timestamp")
			return
		}
		exp = &t
	}
	u, err := s.db.UserByID(r.Context(), uid(r))
	if err != nil {
		writeErr(w, 401, "unknown user")
		return
	}
	n, err := s.db.CountLinks(r.Context(), u.ID)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	if n >= planLimits[u.Plan] {
		writeErr(w, 402, "link limit reached for the "+u.Plan+" plan; upgrade to create more")
		return
	}
	owner := u.ID
	l, err := s.db.CreateLink(r.Context(), &owner, target, in.Alias, exp)
	if errors.Is(err, store.ErrConflict) {
		writeErr(w, 409, "alias already taken")
		return
	} else if err != nil {
		slog.Error("create link", "err", err)
		writeErr(w, 500, "internal error")
		return
	}
	s.cache.Set(r.Context(), l.Code, l.TargetURL, l.ExpiresAt) // warm the cache
	writeJSON(w, 201, s.view(*l))
}

// guestTTL is how long anonymous links live; signing up keeps links forever.
const guestTTL = 7 * 24 * time.Hour

var errSelf = errors.New("that link already points to this service")

// isSelf blocks shortening our own short links (redirect loops / chaining abuse).
func (s *Server) isSelf(target string) bool {
	base, err1 := url.Parse(s.cfg.BaseURL)
	t, err2 := url.Parse(target)
	return err1 == nil && err2 == nil && strings.EqualFold(base.Host, t.Host)
}

// createPublicLink lets anyone shorten a URL without an account. Guest links
// expire after guestTTL, can't use custom aliases and have no analytics.
func (s *Server) createPublicLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		URL string `json:"url"`
	}
	if !decode(w, r, &in) {
		return
	}
	target, err := normalizeURL(in.URL)
	if err == nil && s.isSelf(target) {
		err = errSelf
	}
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	exp := time.Now().Add(guestTTL)
	l, err := s.db.CreateLink(r.Context(), nil, target, "", &exp)
	if err != nil {
		slog.Error("create guest link", "err", err)
		writeErr(w, 500, "internal error")
		return
	}
	s.cache.Set(r.Context(), l.Code, l.TargetURL, l.ExpiresAt)
	writeJSON(w, 201, s.view(*l))
}

func (s *Server) listLinks(w http.ResponseWriter, r *http.Request) {
	limit := clamp(atoi(r.URL.Query().Get("limit"), 50), 1, 200)
	offset := max(atoi(r.URL.Query().Get("offset"), 0), 0)
	ls, err := s.db.ListLinks(r.Context(), uid(r), limit, offset)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	out := make([]linkView, len(ls))
	for i, l := range ls {
		out[i] = s.view(l)
	}
	writeJSON(w, 200, map[string]any{"links": out})
}

func (s *Server) deleteLink(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if err := s.db.DeleteLink(r.Context(), uid(r), code); errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "link not found")
		return
	} else if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	s.cache.Delete(r.Context(), code)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) patchLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Disabled *bool `json:"disabled"`
	}
	if !decode(w, r, &in) || in.Disabled == nil {
		if in.Disabled == nil {
			writeErr(w, 400, "nothing to update")
		}
		return
	}
	code := chi.URLParam(r, "code")
	if err := s.db.SetDisabled(r.Context(), uid(r), code, *in.Disabled); errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "link not found")
		return
	} else if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	s.cache.Delete(r.Context(), code)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) linkStats(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	ok, err := s.db.OwnsLink(r.Context(), uid(r), code)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	if !ok {
		writeErr(w, 404, "link not found")
		return
	}
	u, err := s.db.UserByID(r.Context(), uid(r))
	if err != nil {
		writeErr(w, 401, "unknown user")
		return
	}
	days := allowedDays(u.Plan, atoi(r.URL.Query().Get("days"), 7))
	st, err := s.stats.LinkStats(r.Context(), code, days)
	if err != nil {
		slog.Error("stats", "err", err)
		writeErr(w, 502, "analytics unavailable")
		return
	}
	st.RetentionDays = allowedDays(u.Plan, 1<<20)
	writeJSON(w, 200, st)
}

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	codes, err := s.db.AllCodes(r.Context(), uid(r), 5000)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	u, err := s.db.UserByID(r.Context(), uid(r))
	if err != nil {
		writeErr(w, 401, "unknown user")
		return
	}
	days := allowedDays(u.Plan, atoi(r.URL.Query().Get("days"), 30))
	o, err := s.stats.AccountOverview(r.Context(), codes, days)
	if err != nil {
		slog.Error("overview", "err", err)
		writeErr(w, 502, "analytics unavailable")
		return
	}
	o.RetentionDays = allowedDays(u.Plan, 1<<20)
	writeJSON(w, 200, o)
}

// ---------- health ----------

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"status": "ok", "events_sent": s.events.Sent.Load(), "events_dropped": s.events.Dropped.Load(),
	})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		writeErr(w, 503, "postgres down")
		return
	}
	if err := s.cache.Ping(ctx); err != nil {
		writeErr(w, 503, "redis down")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ready"})
}

// ---------- helpers ----------

func normalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("url is required")
	}
	if len(raw) > 2048 {
		return "", errors.New("url too long (max 2048)")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", errors.New("url must be a valid http(s) address")
	}
	return u.String(), nil
}

func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return v
	}
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if v != "" {
			return v
		}
	}
	return ""
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<16)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeErr(w, 400, "invalid JSON body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func atoi(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

func clamp(n, lo, hi int) int { return max(lo, min(n, hi)) }

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(c int) { w.status = c; w.ResponseWriter.WriteHeader(c) }

func accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		if r.URL.Path == "/healthz" {
			return
		}
		slog.Info("req", "m", r.Method, "p", r.URL.Path, "s", sw.status, "us", time.Since(start).Microseconds())
	})
}

func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				slog.Error("panic", "v", v)
				writeErr(w, 500, "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
