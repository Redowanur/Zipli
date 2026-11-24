package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"shorturl/internal/store"
)

// Google sign-in via the OAuth 2.0 authorization-code flow (server side).
// The client secret never reaches the browser; the web app receives only our
// own JWT, in the URL fragment of /auth/callback (fragments are not sent to
// servers or logged).

const (
	googleAuthURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL = "https://oauth2.googleapis.com/token"
	googleInfoURL  = "https://openidconnect.googleapis.com/v1/userinfo"
	stateCookie    = "zipli_oauth_state"
)

var googleHTTP = &http.Client{Timeout: 10 * time.Second}

func (s *Server) googleRedirectURI() string { return s.cfg.BaseURL + "/api/auth/google/callback" }

func (s *Server) loginRedirect(w http.ResponseWriter, r *http.Request, code string) {
	http.Redirect(w, r, s.cfg.BaseURL+"/login?error="+url.QueryEscape(code), http.StatusFound)
}

func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	if s.cfg.GoogleClientID == "" || s.cfg.GoogleClientSecret == "" {
		s.loginRedirect(w, r, "google_unconfigured")
		return
	}
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		s.loginRedirect(w, r, "google_failed")
		return
	}
	state := hex.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{
		Name: stateCookie, Value: state, Path: "/api/auth/google", MaxAge: 600,
		HttpOnly: true, Secure: strings.HasPrefix(s.cfg.BaseURL, "https://"), SameSite: http.SameSiteLaxMode,
	})
	q := url.Values{
		"client_id":     {s.cfg.GoogleClientID},
		"redirect_uri":  {s.googleRedirectURI()},
		"response_type": {"code"},
		"scope":         {"openid email"},
		"state":         {state},
		"prompt":        {"select_account"},
	}
	http.Redirect(w, r, googleAuthURL+"?"+q.Encode(), http.StatusFound)
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	// One-shot state cookie: always clear it.
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: "", Path: "/api/auth/google", MaxAge: -1})

	if r.URL.Query().Get("error") != "" { // user cancelled or denied
		s.loginRedirect(w, r, "google_cancelled")
		return
	}
	c, err := r.Cookie(stateCookie)
	state := r.URL.Query().Get("state")
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(c.Value), []byte(state)) != 1 {
		s.loginRedirect(w, r, "google_failed")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		s.loginRedirect(w, r, "google_failed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	sub, email, err := s.googleIdentity(ctx, code)
	if err != nil {
		slog.Warn("google sign-in failed", "err", err)
		s.loginRedirect(w, r, "google_failed")
		return
	}
	u, err := s.db.UpsertGoogleUser(ctx, sub, email)
	if errors.Is(err, store.ErrConflict) {
		s.loginRedirect(w, r, "google_conflict")
		return
	} else if err != nil {
		slog.Error("google upsert user", "err", err)
		s.loginRedirect(w, r, "google_failed")
		return
	}

	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(u.ID, 10),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		s.loginRedirect(w, r, "google_failed")
		return
	}
	http.Redirect(w, r, s.cfg.BaseURL+"/auth/callback#token="+url.QueryEscape(tok), http.StatusFound)
}

// googleIdentity exchanges the code and returns the verified Google account id + email.
func (s *Server) googleIdentity(ctx context.Context, code string) (sub, email string, err error) {
	form := url.Values{
		"code": {code}, "client_id": {s.cfg.GoogleClientID}, "client_secret": {s.cfg.GoogleClientSecret},
		"redirect_uri": {s.googleRedirectURI()}, "grant_type": {"authorization_code"},
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := googleHTTP.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	var tr struct {
		AccessToken string `json:"access_token"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&tr) != nil || tr.AccessToken == "" {
		return "", "", errors.New("token exchange rejected (status " + strconv.Itoa(resp.StatusCode) + ")")
	}

	req, _ = http.NewRequestWithContext(ctx, http.MethodGet, googleInfoURL, nil)
	req.Header.Set("Authorization", "Bearer "+tr.AccessToken)
	resp2, err := googleHTTP.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp2.Body.Close()
	var info struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if resp2.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp2.Body, 1<<16)).Decode(&info) != nil {
		return "", "", errors.New("userinfo failed")
	}
	if info.Sub == "" || info.Email == "" || !info.EmailVerified {
		return "", "", errors.New("google account has no verified email")
	}
	return info.Sub, strings.ToLower(info.Email), nil
}
