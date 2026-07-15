-- +goose Up

CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    client_id   TEXT UNIQUE NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT UNIQUE NOT NULL,
    display_name TEXT,
    role         TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
    disabled_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_identities (
    user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'google' | 'microsoft' | 'github' | 'oidc:<name>' | 'dev'
    subject  TEXT NOT NULL,
    PRIMARY KEY (provider, subject)
);
CREATE INDEX user_identities_user_id_idx ON user_identities (user_id);

CREATE TABLE api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID NOT NULL REFERENCES customers (id),
    name         TEXT NOT NULL,
    key_prefix   TEXT NOT NULL, -- non-secret, e.g. 'otm_ab12cd34'
    key_hash     BYTEA NOT NULL, -- SHA-256 of the full key; secret is never stored
    created_by   UUID REFERENCES users (id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);
CREATE INDEX api_keys_prefix_active_idx ON api_keys (key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX api_keys_customer_idx ON api_keys (customer_id);

-- Session store for github.com/alexedwards/scs (pgxstore layout).
CREATE TABLE sessions (
    token  TEXT PRIMARY KEY,
    data   BYTEA NOT NULL,
    expiry TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions (expiry);

CREATE TABLE audit_log (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id UUID,
    actor_type    TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'agent')),
    action        TEXT NOT NULL, -- e.g. 'customer.create', 'apikey.revoke'
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    customer_id   UUID,
    payload       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_created_idx ON audit_log (created_at);

-- +goose Down
DROP TABLE audit_log;
DROP TABLE sessions;
DROP TABLE api_keys;
DROP TABLE user_identities;
DROP TABLE users;
DROP TABLE customers;
