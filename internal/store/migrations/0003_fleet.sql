-- +goose Up

-- Edge-agent enrollment tokens (per customer). Secret format:
-- otm_bt_<8 hex prefix>_<32-byte secret>; only the SHA-256 is stored.
CREATE TABLE bootstrap_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID NOT NULL REFERENCES customers (id),
    name         TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_hash   BYTEA NOT NULL,
    max_uses     INT NOT NULL DEFAULT 0, -- 0 = unlimited
    used_count   INT NOT NULL DEFAULT 0,
    created_by   UUID REFERENCES users (id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);
CREATE INDEX bootstrap_tokens_prefix_active_idx ON bootstrap_tokens (token_prefix) WHERE revoked_at IS NULL;
CREATE INDEX bootstrap_tokens_customer_idx ON bootstrap_tokens (customer_id);

-- Collector instances: gateway replicas (reporting-only) and OpAMP-managed
-- edge agents. Live heartbeat state is kept in memory by the OpAMP module;
-- last_seen_at/health are flushed write-behind (~15s), never per beat.
CREATE TABLE agents (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_uid         BYTEA UNIQUE NOT NULL, -- OpAMP instance UID (16 bytes)
    customer_id          UUID REFERENCES customers (id), -- NULL for gateway replicas
    class                TEXT NOT NULL CHECK (class IN ('gateway', 'edge')),
    name                 TEXT,
    agent_version        TEXT,
    description          JSONB, -- full AgentDescription attributes
    capabilities         BIGINT,
    assigned_config_hash BYTEA, -- SHA-256 of the desired (rendered) config
    reported_config_hash BYTEA, -- what the agent says it runs
    reported_config_yaml TEXT,  -- last effective config report (for the diff view)
    remote_config_status TEXT NOT NULL DEFAULT 'unset'
        CHECK (remote_config_status IN ('unset', 'applying', 'applied', 'failed')),
    remote_config_error  TEXT,
    health               JSONB,
    healthy              BOOLEAN,
    connected            BOOLEAN NOT NULL DEFAULT false,
    last_seen_at         TIMESTAMPTZ,
    enrolled_via         UUID REFERENCES bootstrap_tokens (id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agents_customer_idx ON agents (customer_id);
CREATE INDEX agents_class_idx ON agents (class);

-- Status TRANSITIONS only (connect/disconnect/config/health flips) — never
-- heartbeats.
CREATE TABLE agent_events (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id   UUID NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN
        ('enrolled', 'connected', 'disconnected', 'config_applied', 'config_failed', 'healthy', 'unhealthy')),
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agent_events_agent_idx ON agent_events (agent_id, id DESC);

-- Pipelines gain the edge target class (standalone config pushed via OpAMP).
ALTER TABLE pipelines DROP CONSTRAINT pipelines_target_class_check;
ALTER TABLE pipelines ADD CONSTRAINT pipelines_target_class_check
    CHECK (target_class IN ('forwarding', 'edge'));

-- +goose Down
ALTER TABLE pipelines DROP CONSTRAINT pipelines_target_class_check;
ALTER TABLE pipelines ADD CONSTRAINT pipelines_target_class_check
    CHECK (target_class IN ('forwarding'));
DROP TABLE agent_events;
DROP TABLE agents;
DROP TABLE bootstrap_tokens;
