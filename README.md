# otelfleet

Self-hosted, multi-tenant OpenTelemetry collector fleet management: receive logs, traces
and metrics from multiple customers via OTLP, attribute every datapoint to a tenant,
store it in ClickHouse and/or forward it to external backends — managed through a web UI.

> Status: pre-release (Phase 1 — core loop MVP). Not yet ready for production use.

## What it does

- **Multi-tenant ingest** — create a customer in the UI and get an API key + client ID;
  the gateway collector authenticates every OTLP request and stamps `tenant.id` on the data.
- **Fleet management** — central gateway collectors on Kubernetes plus edge agents at
  customer sites managed via OpAMP (Phase 3).
- **Pipelines from the UI** — receivers → processors → exporters, versioned configs,
  validated with the real collector binary before rollout (Phase 2).
- **Accurate throughput metrics** — per customer and per pipeline stage
  (accepted / refused / dropped / queued / exported).
- **SSO** — Google, Microsoft, GitHub, generic OIDC. RBAC: admin / operator / viewer.

## Architecture (short version)

One Go binary (`otelfleet`) serves the REST API + embedded React SPA, the OpAMP server
and an internal gRPC service used by the gateway collectors to validate API keys.
Telemetry is stored in ClickHouse (tenant-keyed schema), collector self-telemetry in
VictoriaMetrics, control-plane state in PostgreSQL. The gateway is a custom collector
distribution (OCB) with two small components: `tenantauth` (API-key authenticator) and
`tenantstamp` (tenant attribution processor).

See [`docs/`](docs/) for the full architecture.

## Development quickstart

Requirements: Go 1.26+, Node 24+ with pnpm, Docker + Compose.

```sh
make dev-up      # postgres, clickhouse, victoriametrics, gateway collector
make run         # control plane on :8080 (serves API; SPA via `pnpm dev` proxy)
cd web && pnpm install && pnpm dev
```

Send test data against your API key:

```sh
telemetrygen logs --otlp-insecure --otlp-endpoint localhost:4317 \
  --otlp-header 'authorization="Bearer <api-key>"'
```

## Repository layout

```
api/openapi.yaml     REST contract (source of truth for Go + TS codegen)
cmd/otelfleet        control-plane binary
internal/            backend packages
proto/               internal gRPC contract (API-key validation)
collector/           custom collector distro (OCB manifest + custom components)
web/                 React SPA
deploy/              compose dev env, Helm charts, ClickHouse DDL
```

## License

[Apache-2.0](LICENSE)
