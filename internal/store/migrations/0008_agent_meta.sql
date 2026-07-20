-- +goose Up

-- acked_config_hash is the config hash the agent confirmed via OpAMP
-- RemoteConfigStatus.last_remote_config_hash — the authoritative "in sync"
-- signal. The reported/effective-config hash is a re-serialization of the
-- applied config and never equals the assigned hash, so it cannot be used to
-- decide sync state (every agent would look permanently out of sync).
ALTER TABLE agents ADD COLUMN acked_config_hash BYTEA;

-- Operator-set metadata, independent of the agent-reported AgentDescription:
-- a friendly display name (overrides the reported host/service name in the UI)
-- and free-form labels for grouping/filtering a fleet.
ALTER TABLE agents ADD COLUMN display_name TEXT;
ALTER TABLE agents ADD COLUMN labels JSONB NOT NULL DEFAULT '{}'::jsonb;

-- +goose Down
ALTER TABLE agents DROP COLUMN labels;
ALTER TABLE agents DROP COLUMN display_name;
ALTER TABLE agents DROP COLUMN acked_config_hash;
