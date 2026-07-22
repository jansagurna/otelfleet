-- +goose Up

-- Metered-billing pricing. A singleton row (id = true) holds the global price
-- list. Prices are integer micro-units of the configured currency (1 unit =
-- 1e-6 currency), matching the codebase's int64-money convention and avoiding
-- float rounding in statements. Defaults are 0 (billing disabled until set).
CREATE TABLE billing_settings (
    id                            BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    price_per_gib_micro           BIGINT NOT NULL DEFAULT 0,
    price_per_million_items_micro BIGINT NOT NULL DEFAULT 0,
    currency                      TEXT NOT NULL DEFAULT 'EUR',
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                    UUID REFERENCES users(id)
);

INSERT INTO billing_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE billing_settings;
