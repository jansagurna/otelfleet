-- +goose Up

-- Database-managed SSO providers (the OTELFLEET_OIDC_* env provider keeps
-- working as a read-only fallback). Client secrets are envelope-encrypted
-- with the master key (OTELFLEET_MASTER_KEY) before they reach this table.
CREATE TABLE auth_providers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type              TEXT NOT NULL CHECK (type IN ('google', 'microsoft', 'github', 'oidc')),
    name              TEXT UNIQUE NOT NULL, -- slug used in /auth/{name}/start
    display_name      TEXT NOT NULL,
    client_id         TEXT NOT NULL,
    client_secret_enc BYTEA NOT NULL,
    issuer            TEXT, -- type oidc only
    enabled           BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE users DROP COLUMN last_login_at;
DROP TABLE auth_providers;
