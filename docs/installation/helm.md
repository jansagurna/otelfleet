# Helm installation

The chart at `deploy/charts/otelfleet` deploys the control plane, the gateway
(ingest) tier and the forwarding tier.

## Prerequisites — bring your own stateful services

The chart deliberately ships **no** databases. You need, reachable from the
cluster:

| Service | Used for | Values key |
| --- | --- | --- |
| PostgreSQL | control-plane state (customers, keys, pipelines, users, audit) | `external.databaseUrl` / `external.databaseUrlSecret` |
| ClickHouse | telemetry storage (tenant-keyed schema) | `external.clickhouse.*` |
| Prometheus-compatible TSDB (e.g. VictoriaMetrics) | collector self-telemetry, powers all throughput charts | `external.victoriaMetrics.*` |

Apply the ClickHouse DDL from `deploy/clickhouse/schema/` yourself — the
collector's ClickHouse exporter runs with `create_schema: false` and the schema is
owned by this repository.

## Install

```sh
helm install otelfleet oci://ghcr.io/sag-solutions/charts/otelfleet \
  --namespace otelfleet --create-namespace \
  --values my-values.yaml
```

Minimal `my-values.yaml`:

```yaml
external:
  databaseUrlSecret: otelfleet-db   # Secret with key OTELFLEET_DATABASE_URL
  clickhouse:
    addr: clickhouse.data:9000
    database: otel
    user: otelfleet
    passwordSecret: otelfleet-ch    # Secret with key OTELFLEET_CLICKHOUSE_PASSWORD
    exporterEndpoint: "tcp://clickhouse.data:9000?database=otel&username=otelfleet&password=..."
  victoriaMetrics:
    url: http://victoriametrics.monitoring:8428
    remoteWriteUrl: http://victoriametrics.monitoring:8428/api/v1/write

controlPlane:
  baseUrl: https://otelfleet.example.com   # required for SSO redirects
  adminEmails: ["ops@example.com"]         # role admin on first login
  sessionSecure: true

ingress:
  enabled: true
  host: otelfleet.example.com
```

## Images

| Component | Image | Contents |
| --- | --- | --- |
| Control plane | `ghcr.io/sag-solutions/otelfleet` | Go binary + embedded web UI + bundled collector binary (used for `otelcol validate`) |
| Gateway / forwarding collector | `ghcr.io/sag-solutions/otelfleet-collector` | custom OCB distro (`tenantauth`, `tenantstamp`, routing connector, …) |
| Edge agent | `ghcr.io/sag-solutions/otelfleet-supervisor` | OpAMP supervisor + the same collector distro (runs at customer sites, not deployed by this chart) |

Tags default to the chart's `appVersion`; override with `images.*.tag`.

## Control plane

```yaml
controlPlane:
  replicas: 1   # keep 1: OpAMP WebSockets are process-sticky
```

!!! warning "Single replica, for now"

    Edge-agent OpAMP connections are stateful WebSockets bound to one process.
    Run **exactly one** control-plane replica until the multi-replica story
    (an OpAMP gateway) lands.

### Exposing OpAMP to edge agents

Edge agents live in customer networks and dial **out** to the control plane's
OpAMP WebSocket endpoint (`/v1/opamp`, port 4320). The default is `ClusterIP`;
for real edge agents expose it:

```yaml
controlPlane:
  opamp:
    service:
      type: LoadBalancer   # or wire an ingress/gateway with WebSocket + TLS support
      port: 4320
```

Terminate TLS in front of it (the in-pod listener is plaintext `ws://`) and point
supervisors at `wss://opamp.example.com/v1/opamp`.

## Forwarding modes

The forwarding tier's entire collector config is rendered by the control plane.
Two rollout mechanisms:

=== "deployment (default)"

    ```yaml
    controlPlane:
      distributor: publish
    forwarding:
      mode: deployment
    ```

    A plain Deployment whose collector loads its config from the control plane's
    ops endpoint at pod start (HTTP confmap provider). Activating a pipeline
    version leaves the pods on the old config until they restart — the UI shows
    `pending_restart`. Apply with:

    ```sh
    kubectl rollout restart deployment/otelfleet-forwarding -n otelfleet
    ```

=== "operator"

    ```yaml
    controlPlane:
      distributor: k8s
    forwarding:
      mode: operator
    ```

    Requires the
    [opentelemetry-operator](https://github.com/open-telemetry/opentelemetry-operator).
    The control plane patches the `OpenTelemetryCollector` CR
    (`OTELFLEET_K8S_CR_NAME` / `OTELFLEET_K8S_CR_NAMESPACE`, RBAC included in the
    chart) and the operator rolls the collectors — no manual restart.

## Gateway tier

```yaml
gateway:
  replicas: 2
  service:
    type: ClusterIP   # front with an LB / gRPC-capable ingress for customer OTLP
  persistentQueue:
    enabled: true     # PVC-backed sending queue for the ClickHouse exporter
    size: 5Gi
```

The gateway's static config is checksum-annotated: chart upgrades that change it
roll the pods automatically.

## Secrets encryption (`OTELFLEET_MASTER_KEY`)

The control plane needs `OTELFLEET_MASTER_KEY` (base64, 32 bytes —
`openssl rand -base64 32`) to store SSO providers and pipeline password fields;
see the [configuration reference](configuration.md#secrets-encryption).

!!! note "Chart gap"

    The chart does not yet expose a value for `OTELFLEET_MASTER_KEY`. Until it
    does, inject it yourself, e.g. with a post-render patch or:

    ```sh
    kubectl -n otelfleet create secret generic otelfleet-master-key \
      --from-literal=OTELFLEET_MASTER_KEY="$(openssl rand -base64 32)"
    kubectl -n otelfleet set env deployment/otelfleet-control-plane \
      --from=secret/otelfleet-master-key
    ```

    (Note: `kubectl set env` edits drift from the chart — re-apply after
    `helm upgrade` until the chart supports this natively.)

    Without the key the server runs, but saving an SSO provider or a pipeline
    with password fields fails with a clear error. Losing the key makes stored
    secrets unrecoverable — keep it in a secret manager.
