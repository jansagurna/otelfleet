-- +goose Up

-- SCIM external id: the identity-provider's stable id for a user, stored so
-- SCIM operations (Okta/Entra/etc.) can reconcile a user independently of the
-- email/userName. Nullable — only set for SCIM-provisioned users.
ALTER TABLE users ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX users_external_id_key ON users (external_id) WHERE external_id IS NOT NULL;

-- +goose Down
DROP INDEX users_external_id_key;
ALTER TABLE users DROP COLUMN external_id;
