-- +goose Up

-- SAML 2.0 SSO provider support. SAML providers store their (non-secret) IdP
-- configuration — entity id, SSO URL, signing certificate — in saml_config;
-- they carry no client_id/client_secret (those columns stay '' / empty for
-- SAML rows).
ALTER TABLE auth_providers DROP CONSTRAINT auth_providers_type_check;
ALTER TABLE auth_providers ADD CONSTRAINT auth_providers_type_check
    CHECK (type IN ('google', 'microsoft', 'github', 'oidc', 'saml'));
ALTER TABLE auth_providers ADD COLUMN saml_config JSONB;

-- +goose Down
ALTER TABLE auth_providers DROP COLUMN saml_config;
ALTER TABLE auth_providers DROP CONSTRAINT auth_providers_type_check;
ALTER TABLE auth_providers ADD CONSTRAINT auth_providers_type_check
    CHECK (type IN ('google', 'microsoft', 'github', 'oidc'));
