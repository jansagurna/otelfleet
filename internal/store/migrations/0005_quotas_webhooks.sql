-- +goose Up

-- Per-tenant ingest quota (items/sec across all signals; NULL = unlimited)
-- and telemetry retention override (NULL = keep until the global table TTL).
ALTER TABLE customers ADD COLUMN rate_limit_items_per_sec INT
    CHECK (rate_limit_items_per_sec IS NULL OR rate_limit_items_per_sec > 0);
ALTER TABLE customers ADD COLUMN retention_days INT
    CHECK (retention_days IS NULL OR (retention_days >= 1 AND retention_days <= 30));

-- Alerting webhooks: HMAC-SHA256-signed POSTs on fleet events. The signing
-- secret is envelope-encrypted like all other stored secrets.
CREATE TABLE webhooks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    url        TEXT NOT NULL,
    events     TEXT[] NOT NULL, -- subset of: agent_offline, agent_config_failed, agent_unhealthy
    secret_enc BYTEA, -- NULL = unsigned deliveries
    enabled    BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE webhooks;
ALTER TABLE customers DROP COLUMN retention_days;
ALTER TABLE customers DROP COLUMN rate_limit_items_per_sec;
