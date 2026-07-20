-- +goose Up

-- Per-agent OpAMP tokens. On the first bootstrap-authenticated connection the
-- control plane issues a per-agent token (format otm_at_<prefix>_<secret>) and
-- offers it via OpAMPConnectionSettings; the agent then authenticates with it.
-- Only the SHA-256 is stored. Revoking the customer's bootstrap token no longer
-- affects agents that have flipped to their per-agent token.
ALTER TABLE agents ADD COLUMN agent_token_prefix    TEXT;
ALTER TABLE agents ADD COLUMN agent_token_hash      BYTEA;
ALTER TABLE agents ADD COLUMN agent_token_issued_at TIMESTAMPTZ;

CREATE INDEX agents_token_prefix_idx ON agents (agent_token_prefix)
    WHERE agent_token_prefix IS NOT NULL;

-- +goose Down
DROP INDEX agents_token_prefix_idx;
ALTER TABLE agents DROP COLUMN agent_token_issued_at;
ALTER TABLE agents DROP COLUMN agent_token_hash;
ALTER TABLE agents DROP COLUMN agent_token_prefix;
