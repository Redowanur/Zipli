// Command zipli shortens URLs from the terminal.
//
//	zipli https://example.com/a/very/long/link        # guest link (7 days)
//	zipli login                                       # then links are permanent + in your dashboard
//	zipli -alias my-sale -expires 30d https://...     # signed-in only
//	echo https://example.com | zipli                  # URLs from stdin, one per line
//
// Output is just the short URL, so it pipes cleanly (zipli URL | pbcopy).
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/term"
)

const defaultServer = "http://localhost:8088"

var version = "dev"

type config struct {
	Server string `json:"server,omitempty"`
	Token  string `json:"token,omitempty"`
}

func configPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "zipli", "config.json")
}

func loadConfig() config {
	var c config
	if b, err := os.ReadFile(configPath()); err == nil {
		_ = json.Unmarshal(b, &c)
	}
	return c
}

func saveConfig(c config) error {
	p := configPath()
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile(p, b, 0o600) // token inside: owner-only
}

func fail(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "zipli: "+format+"\n", a...)
	os.Exit(1)
}

const usage = `zipli - shorten URLs from the terminal

Usage:
  zipli [flags] <url> [url...]    shorten URLs (or read them from stdin)
  zipli login [flags]             sign in so links are permanent and show in your dashboard
  zipli logout                    forget the saved login
  zipli version

Flags:
  -server URL     Zipli server (env ZIPLI_SERVER, default saved server or ` + defaultServer + `)
  -alias NAME     custom short code (signed-in only)
  -expires WHEN   expiry: a duration like 48h or 30d, or an RFC 3339 time (signed-in only)
  -json           print the full API response as JSON
  -token TOKEN    use this session token (env ZIPLI_TOKEN) instead of the saved login

Without a login, links are guest links that expire after 7 days.
`

type opts struct {
	server, alias, expires, token string
	asJSON                        bool
}

// parseInterspersed lets flags appear before or after the URLs.
func parseInterspersed(fs *flag.FlagSet, args []string) ([]string, error) {
	var rest []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		args = fs.Args()
		if len(args) == 0 {
			return rest, nil
		}
		rest = append(rest, args[0])
		args = args[1:]
	}
}

func newFlags(o *opts) *flag.FlagSet {
	fs := flag.NewFlagSet("zipli", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.StringVar(&o.server, "server", "", "")
	fs.StringVar(&o.alias, "alias", "", "")
	fs.StringVar(&o.expires, "expires", "", "")
	fs.StringVar(&o.token, "token", "", "")
	fs.BoolVar(&o.asJSON, "json", false, "")
	return fs
}

func resolveServer(o opts, c config) string {
	for _, v := range []string{o.server, os.Getenv("ZIPLI_SERVER"), c.Server, defaultServer} {
		if v != "" {
			return strings.TrimRight(v, "/")
		}
	}
	return defaultServer
}

func main() {
	args := os.Args[1:]
	if len(args) > 0 {
		switch args[0] {
		case "-h", "--help", "help":
			fmt.Print(usage)
			return
		case "version", "-version", "--version":
			fmt.Println("zipli", version)
			return
		case "login":
			cmdLogin(args[1:])
			return
		case "logout":
			cmdLogout()
			return
		}
	}

	var o opts
	fs := newFlags(&o)
	urls, err := parseInterspersed(fs, args)
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Print(usage)
			return
		}
		fail("%v\n\n%s", err, usage)
	}
	if len(urls) == 0 {
		if fi, _ := os.Stdin.Stat(); fi != nil && fi.Mode()&os.ModeCharDevice != 0 {
			fmt.Fprint(os.Stderr, usage)
			os.Exit(2)
		}
		sc := bufio.NewScanner(os.Stdin)
		for sc.Scan() {
			if t := strings.TrimSpace(sc.Text()); t != "" {
				urls = append(urls, t)
			}
		}
	}
	if len(urls) == 0 {
		fail("no URL given")
	}

	cfg := loadConfig()
	server := resolveServer(o, cfg)
	token := firstNonEmpty(o.token, os.Getenv("ZIPLI_TOKEN"), cfg.Token)
	if token == "" && (o.alias != "" || o.expires != "") {
		fail("-alias and -expires need an account: run `zipli login` first")
	}
	if o.alias != "" && len(urls) > 1 {
		fail("-alias can only be used with a single URL")
	}
	exp, err := parseExpires(o.expires)
	if err != nil {
		fail("%v", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	failed := false
	for _, u := range urls {
		body := map[string]any{"url": u}
		path := "/api/links/public"
		if token != "" {
			path = "/api/links"
			if o.alias != "" {
				body["alias"] = o.alias
			}
			if exp != "" {
				body["expires_at"] = exp
			}
		}
		var out map[string]any
		status, err := call(client, server+path, token, body, &out)
		if err == nil && status == http.StatusUnauthorized && token != "" {
			err = errors.New("your login expired or is invalid: run `zipli login` again")
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "zipli: %s: %v\n", u, err)
			failed = true
			continue
		}
		if o.asJSON {
			b, _ := json.Marshal(out)
			fmt.Println(string(b))
		} else {
			fmt.Println(out["short_url"])
		}
	}
	if failed {
		os.Exit(1)
	}
}

func parseExpires(v string) (string, error) {
	if v == "" {
		return "", nil
	}
	if strings.HasSuffix(v, "d") {
		if n, err := strconv.Atoi(strings.TrimSuffix(v, "d")); err == nil && n > 0 {
			return time.Now().Add(time.Duration(n) * 24 * time.Hour).UTC().Format(time.RFC3339), nil
		}
	}
	if d, err := time.ParseDuration(v); err == nil && d > 0 {
		return time.Now().Add(d).UTC().Format(time.RFC3339), nil
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t.UTC().Format(time.RFC3339), nil
	}
	return "", fmt.Errorf("invalid -expires %q (use 48h, 30d or an RFC 3339 time)", v)
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

// call POSTs JSON and decodes the response into out. API errors ({"error": "..."}) become Go errors.
func call(c *http.Client, url, token string, in any, out *map[string]any) (int, error) {
	b, _ := json.Marshal(in)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "zipli-cli/"+version)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := c.Do(req)
	if err != nil {
		return 0, fmt.Errorf("cannot reach %s: %w", url, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	if resp.StatusCode >= 300 {
		if msg, ok := m["error"].(string); ok && msg != "" {
			return resp.StatusCode, errors.New(msg)
		}
		if resp.StatusCode == http.StatusTooManyRequests {
			return resp.StatusCode, errors.New("rate limited: slow down, or log in for higher limits")
		}
		return resp.StatusCode, fmt.Errorf("server returned %s", resp.Status)
	}
	*out = m
	return resp.StatusCode, nil
}

func cmdLogin(args []string) {
	var o opts
	fs := newFlags(&o)
	email := fs.String("email", "", "")
	if _, err := parseInterspersed(fs, args); err != nil {
		fail("%v", err)
	}
	cfg := loadConfig()
	server := resolveServer(o, cfg)

	in := bufio.NewReader(os.Stdin)
	if *email == "" {
		fmt.Fprint(os.Stderr, "Email: ")
		line, _ := in.ReadString('\n')
		*email = strings.TrimSpace(line)
	}
	var password string
	if p := os.Getenv("ZIPLI_PASSWORD"); p != "" {
		password = p
	} else if term.IsTerminal(int(os.Stdin.Fd())) {
		fmt.Fprint(os.Stderr, "Password: ")
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if err != nil {
			fail("cannot read password: %v", err)
		}
		password = string(b)
	} else {
		line, _ := in.ReadString('\n')
		password = strings.TrimRight(line, "\r\n")
	}

	var out map[string]any
	_, err := call(&http.Client{Timeout: 15 * time.Second}, server+"/api/auth/login", "", map[string]string{"email": *email, "password": password}, &out)
	if err != nil {
		fail("login failed: %v", err)
	}
	tok, _ := out["token"].(string)
	if tok == "" {
		fail("login failed: no token returned")
	}
	cfg.Token = tok
	if o.server != "" || os.Getenv("ZIPLI_SERVER") != "" {
		cfg.Server = server
	}
	if err := saveConfig(cfg); err != nil {
		fail("cannot save login: %v", err)
	}
	fmt.Fprintf(os.Stderr, "Logged in as %s (saved to %s). Sessions last 7 days.\n", *email, configPath())
}

func cmdLogout() {
	cfg := loadConfig()
	cfg.Token = ""
	if err := saveConfig(cfg); err != nil {
		fail("%v", err)
	}
	fmt.Fprintln(os.Stderr, "Logged out.")
}
