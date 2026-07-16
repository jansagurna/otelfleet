# otelfleet collector distribution

Custom OpenTelemetry Collector distribution for the otelfleet ingest tier
(gateway) and the forwarding tier, built with the
[OpenTelemetry Collector Builder (OCB)](https://opentelemetry.io/docs/collector/custom-collector/).

Pinned release train: **collector core v1.62.0 / v0.156.0, contrib v0.156.0,
OCB v0.156.0** (see `builder-config.yaml`).

## Components

| Kind | Components |
| --- | --- |
| Receivers | `otlp` |
| Processors | `memory_limiter`, `batch`, **`tenantstamp`** (local), `filter`, `transform`, `attributes`, `resource` |
| Exporters | `clickhouse`, `prometheusremotewrite`, `debug`, `otlp`, `otlphttp`, `file` |
| Connectors | `count`, `routing` |
| Extensions | **`tenantauth`** (local), `file_storage`, `health_check`, `pprof` |
| Providers | `env`, `file`, `http`, `https`, `yaml` |

The forwarding tier loads its entire (control-plane-rendered) config through
the `http` confmap provider
(`--config=http://.../internal/v1/collector-config/forwarding`);
`testdata/forwarding-sample.yaml` is the contract test for the rendered
config shape and is checked by `make -C collector validate`.

Local components (own Go modules, wired in via `replaces`):

- [`extension/tenantauth`](extension/tenantauth) — server authenticator that
  validates ingest API keys against the control plane's
  `otelfleet.auth.v1.AuthService` (gRPC, `proto/authservice.proto`) with a
  positive/negative/stale-if-error cache, and attaches the tenant identity to
  `client.Info`.
- [`processor/tenantstamp`](processor/tenantstamp) — stamps
  `tenant.id` / `client.id` / `customer.id` from the authenticated identity
  onto every resource (removing client-supplied values first) and drops
  unauthenticated data.

## Building

```sh
make -C collector build      # go run go.opentelemetry.io/collector/cmd/builder@v0.156.0
make -C collector test       # unit tests for the local components
make -C collector validate   # validate deploy/compose/otelcol-gateway.yaml
make -C collector docker     # docker build -f Dockerfile.collector (repo root context)
make -C collector proto      # regenerate tenantauth's AuthService stubs
```

The binary lands in `collector/dist/otelfleet-collector` (gitignored).

The container image is built by `Dockerfile.collector` at the repo root
(multi-stage: OCB in `golang:1.26`, runtime `distroless/static` running as
non-root) and consumed by the `gateway` service in
`deploy/compose/docker-compose.yaml` with
`deploy/compose/otelcol-gateway.yaml` as its config.

## Version bumps

When bumping the collector release train, update in lockstep:

1. `OCB_VERSION` in `collector/Makefile` and `Dockerfile.collector`.
2. All `gomod` pins in `builder-config.yaml`.
3. The collector API deps of `extension/tenantauth` and
   `processor/tenantstamp` (`go get ... && go mod tidy`).
4. Re-verify `deploy/clickhouse/schema/*.sql` against the clickhouse
   exporter's insert statements (`internal/sqltemplates/*_insert.sql` in the
   pinned exporter) — the exporter runs with `create_schema: false` and the
   DDL is owned here.
