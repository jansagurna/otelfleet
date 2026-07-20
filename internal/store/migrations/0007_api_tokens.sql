-- +goose Up

-- Management-API tokens (format otm_pat_<prefix>_<secret>) for programmatic
-- access (CLI, CI, automation) — distinct from ingest API keys and OpAMP
-- tokens. Each carries its own RBAC role; only the SHA-256 is stored.
CREATE TABLE api_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_hash   BYTEA NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
    created_by   UUID REFERENCES users (id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);
CREATE INDEX api_tokens_prefix_active_idx ON api_tokens (token_prefix) WHERE revoked_at IS NULL;

-- +goose Down
DROP TABLE api_tokens;
