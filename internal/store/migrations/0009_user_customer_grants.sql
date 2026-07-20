-- +goose Up

-- Optional per-customer scoping for non-admin users (tenant-scoped RBAC).
-- A user keeps a single global role (admin/operator/viewer); grants narrow
-- WHICH customers that role applies to. Semantics enforced in the API:
--   - admins always access every customer (grants ignored);
--   - a non-admin with >= 1 grant is limited to those customers;
--   - a non-admin with no grants accesses every customer (backward compatible).
CREATE TABLE user_customer_grants (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, customer_id)
);

CREATE INDEX user_customer_grants_customer_idx ON user_customer_grants (customer_id);

-- +goose Down
DROP TABLE user_customer_grants;
