-- +goose Up

-- Notification-channel type. 'webhook' is the existing generic HMAC-signed
-- JSON POST; 'slack' formats events as a Slack incoming-webhook message (no
-- HMAC — Slack does not verify a signature). Existing rows default to
-- 'webhook', preserving behavior.
ALTER TABLE webhooks ADD COLUMN type TEXT NOT NULL DEFAULT 'webhook'
    CHECK (type IN ('webhook', 'slack'));

-- +goose Down
ALTER TABLE webhooks DROP COLUMN type;
