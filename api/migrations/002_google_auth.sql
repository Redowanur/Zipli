-- Google sign-in: stable Google account id (the OIDC "sub" claim). Nullable: password-only users have none.
ALTER TABLE users ADD COLUMN google_sub TEXT UNIQUE;
