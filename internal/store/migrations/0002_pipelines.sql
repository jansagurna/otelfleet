-- +goose Up

CREATE TABLE pipelines (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id       UUID NOT NULL REFERENCES customers (id),
    name              TEXT NOT NULL,
    target_class      TEXT NOT NULL DEFAULT 'forwarding' CHECK (target_class IN ('forwarding')),
    active_version_id UUID, -- FK added below (pipeline_versions defined after)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (customer_id, name)
);

CREATE TABLE pipeline_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id       UUID NOT NULL REFERENCES pipelines (id) ON DELETE CASCADE,
    version           INT NOT NULL,
    graph             JSONB NOT NULL,
    rendered_yaml     TEXT NOT NULL,
    config_hash       BYTEA NOT NULL, -- SHA-256(rendered_yaml)
    validation_status TEXT NOT NULL CHECK (validation_status IN ('valid', 'invalid')),
    validation_output TEXT,
    created_by        UUID REFERENCES users (id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pipeline_id, version)
);

ALTER TABLE pipelines
    ADD CONSTRAINT pipelines_active_version_fk
        FOREIGN KEY (active_version_id) REFERENCES pipeline_versions (id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX pipeline_versions_pipeline_idx ON pipeline_versions (pipeline_id, version DESC);

-- +goose Down
ALTER TABLE pipelines DROP CONSTRAINT pipelines_active_version_fk;
DROP TABLE pipeline_versions;
DROP TABLE pipelines;
