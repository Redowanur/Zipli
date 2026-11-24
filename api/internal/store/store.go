// Package store is the durable Postgres layer for users and links.
package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"shorturl/internal/shortcode"
	"shorturl/migrations"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("already exists")
)

type Store struct{ pool *pgxpool.Pool }

type User struct {
	ID           int64     `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Plan         string    `json:"plan"`
	CreatedAt    time.Time `json:"created_at"`
}

type Link struct {
	ID        int64      `json:"id"`
	Code      string     `json:"code"`
	TargetURL string     `json:"target_url"`
	UserID    *int64     `json:"-"`
	Disabled  bool       `json:"disabled"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

func Open(ctx context.Context, url string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 20
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close()                         { s.pool.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// Migrate applies embedded migrations in order. An advisory lock makes it
// safe when several API replicas start at once.
func (s *Store) Migrate(ctx context.Context) error {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock(727274)`); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock(727274)`)

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entries, err := migrations.FS.ReadDir(".")
	if err != nil {
		return err
	}
	names := []string{}
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, n := range names {
		var done bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, n).Scan(&done); err != nil {
			return err
		}
		if done {
			continue
		}
		sql, err := migrations.FS.ReadFile(n)
		if err != nil {
			return err
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("migration %s: %w", n, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations(name) VALUES($1)`, n); err != nil {
			tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

func isUnique(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (s *Store) CreateUser(ctx context.Context, email, hash string) (*User, error) {
	u := &User{}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users(email, password_hash) VALUES($1,$2) RETURNING id, email, password_hash, plan, created_at`,
		email, hash).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Plan, &u.CreatedAt)
	if isUnique(err) {
		return nil, ErrConflict
	}
	return u, err
}

func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	u := &User{}
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, plan, created_at FROM users WHERE email=$1`, email).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Plan, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

// UpsertGoogleUser resolves a verified Google identity to a user: by google_sub,
// else by email (linking the Google account to the existing user), else a new
// user with an empty password hash (password login is impossible for it).
func (s *Store) UpsertGoogleUser(ctx context.Context, sub, email string) (*User, error) {
	const cols = `id, email, password_hash, plan, created_at`
	u := &User{}
	scan := func(row pgx.Row) error {
		return row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Plan, &u.CreatedAt)
	}
	err := scan(s.pool.QueryRow(ctx, `SELECT `+cols+` FROM users WHERE google_sub=$1`, sub))
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	// Existing account with the same (Google-verified) email: link it.
	err = scan(s.pool.QueryRow(ctx,
		`UPDATE users SET google_sub=$1 WHERE email=$2 AND google_sub IS NULL RETURNING `+cols, sub, email))
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	err = scan(s.pool.QueryRow(ctx,
		`INSERT INTO users(email, password_hash, google_sub) VALUES($1,'',$2) RETURNING `+cols, email, sub))
	if isUnique(err) {
		return nil, ErrConflict // email already linked to a different Google account
	}
	return u, err
}

func (s *Store) UserByID(ctx context.Context, id int64) (*User, error) {
	u := &User{}
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, plan, created_at FROM users WHERE id=$1`, id).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Plan, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

func (s *Store) CountLinks(ctx context.Context, userID int64) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM links WHERE user_id=$1`, userID).Scan(&n)
	return n, err
}

// CreateLink inserts a link (userID nil = anonymous guest link). With alias == "" a code is generated from the
// sequence; on the (rare) clash with an existing custom alias it retries.
func (s *Store) CreateLink(ctx context.Context, userID *int64, target, alias string, expires *time.Time) (*Link, error) {
	const q = `INSERT INTO links(id, code, target_url, user_id, expires_at) VALUES($1,$2,$3,$4,$5)
	           RETURNING id, code, target_url, disabled, expires_at, created_at`
	for attempt := 0; attempt < 5; attempt++ {
		var id int64
		if err := s.pool.QueryRow(ctx, `SELECT nextval('links_id_seq')`).Scan(&id); err != nil {
			return nil, err
		}
		code := alias
		if code == "" {
			code = shortcode.Encode(id)
		}
		l := &Link{}
		err := s.pool.QueryRow(ctx, q, id, code, target, userID, expires).
			Scan(&l.ID, &l.Code, &l.TargetURL, &l.Disabled, &l.ExpiresAt, &l.CreatedAt)
		if err == nil {
			return l, nil
		}
		if isUnique(err) {
			if alias != "" {
				return nil, ErrConflict
			}
			continue
		}
		return nil, err
	}
	return nil, errors.New("could not allocate a unique code")
}

// Resolve is the redirect-path lookup: target URL plus validity.
func (s *Store) Resolve(ctx context.Context, code string) (target string, expires *time.Time, disabled bool, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT target_url, expires_at, disabled FROM links WHERE code=$1`, code).
		Scan(&target, &expires, &disabled)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return
}

func (s *Store) ListLinks(ctx context.Context, userID int64, limit, offset int) ([]Link, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, code, target_url, disabled, expires_at, created_at FROM links
		 WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Link{}
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.ID, &l.Code, &l.TargetURL, &l.Disabled, &l.ExpiresAt, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) OwnsLink(ctx context.Context, userID int64, code string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM links WHERE code=$1 AND user_id=$2)`, code, userID).Scan(&ok)
	return ok, err
}

func (s *Store) DeleteLink(ctx context.Context, userID int64, code string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM links WHERE code=$1 AND user_id=$2`, code, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) SetDisabled(ctx context.Context, userID int64, code string, disabled bool) error {
	tag, err := s.pool.Exec(ctx, `UPDATE links SET disabled=$3 WHERE code=$1 AND user_id=$2`, code, userID, disabled)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AllCodes returns up to limit link codes owned by a user.
func (s *Store) AllCodes(ctx context.Context, userID int64, limit int) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT code FROM links WHERE user_id=$1 ORDER BY id LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
