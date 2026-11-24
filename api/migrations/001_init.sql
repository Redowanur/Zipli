CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'free',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE links_id_seq START 1000;

CREATE TABLE links (
    id         BIGINT PRIMARY KEY DEFAULT nextval('links_id_seq'),
    code       TEXT NOT NULL UNIQUE,
    target_url TEXT NOT NULL,
    user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
    disabled   BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX links_user_created_idx ON links (user_id, created_at DESC);
