package api

import (
	"context"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// NewOpsHandler serves the operational endpoints on the ops listener:
// /metrics (Prometheus), /healthz (liveness), /readyz (readiness; the supplied
// check typically pings PostgreSQL) and the internal forwarding-collector
// config. forwardingConfig re-renders from database state on every request;
// nil disables the endpoint.
//
// Security note: the config endpoint carries customer exporter credentials in
// plaintext (the forwarding collector needs them; stored copies are encrypted
// at rest). The ops listener must stay cluster-internal.
func NewOpsHandler(reg *prometheus.Registry, ready func(ctx context.Context) error, forwardingConfig func(ctx context.Context) (string, error)) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
	if forwardingConfig != nil {
		mux.HandleFunc("GET /internal/v1/collector-config/forwarding", func(w http.ResponseWriter, r *http.Request) {
			cfg, err := forwardingConfig(r.Context())
			if err != nil {
				http.Error(w, "render forwarding config: "+err.Error(), http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Content-Type", "application/x-yaml")
			_, _ = w.Write([]byte(cfg))
		})
	}
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		if ready != nil {
			if err := ready(ctx); err != nil {
				http.Error(w, "not ready: "+err.Error(), http.StatusServiceUnavailable)
				return
			}
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})
	return mux
}
