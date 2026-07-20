// Command otelfleet runs the otelfleet control plane: the REST API (:8080),
// the internal gRPC AuthService for gateway collectors (:9443), the ops
// listener with metrics and health endpoints (:9090) and the OpAMP server
// for edge agents (:4320, /v1/opamp).
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"

	"github.com/sag-solutions/otelfleet/internal/api"
	"github.com/sag-solutions/otelfleet/internal/auth"
	"github.com/sag-solutions/otelfleet/internal/config"
	"github.com/sag-solutions/otelfleet/internal/crypto"
	"github.com/sag-solutions/otelfleet/internal/ingestauth"
	"github.com/sag-solutions/otelfleet/internal/ingestauth/authv1"
	"github.com/sag-solutions/otelfleet/internal/opamp"
	"github.com/sag-solutions/otelfleet/internal/pipelines"
	"github.com/sag-solutions/otelfleet/internal/retention"
	"github.com/sag-solutions/otelfleet/internal/stats"
	"github.com/sag-solutions/otelfleet/internal/webhooks"
	"github.com/sag-solutions/otelfleet/internal/store"
	"github.com/sag-solutions/otelfleet/internal/tenants"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("otelfleet exited with error", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// PostgreSQL + migrations.
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("create pg pool: %w", err)
	}
	defer pool.Close()
	if err := waitForDB(ctx, pool, 15*time.Second); err != nil {
		return fmt.Errorf("postgres unreachable at %s: %w", cfg.DatabaseURL, err)
	}
	if err := store.Migrate(ctx, pool); err != nil {
		return err
	}
	st := store.NewPG(pool)
	log.Info("database ready, migrations applied")

	// Metrics registry.
	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))

	// Sessions (PostgreSQL-backed).
	sessions := auth.NewSessions(cfg.SessionSecure)
	sessions.UsePostgres(pool)

	// Master key for secrets at rest. Unset is fine: the server runs, but
	// SSO-provider management and pipeline secret fields are unavailable.
	var cipher *crypto.Cipher
	if cfg.MasterKeyBase64 != "" {
		if cipher, err = crypto.New(cfg.MasterKeyBase64); err != nil {
			return fmt.Errorf("OTELFLEET_MASTER_KEY: %w", err)
		}
		log.Info("master key configured, secret encryption enabled")
	} else {
		log.Warn("OTELFLEET_MASTER_KEY not set: SSO provider management and pipeline secret fields are disabled")
	}

	// ClickHouse (lazy; stats endpoints degrade to 503 when unreachable).
	chConn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.ClickHouseAddr},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDatabase,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("clickhouse options: %w", err)
	}
	defer chConn.Close() //nolint:errcheck

	// Services.
	tenantsSvc := tenants.NewService(st)
	statsSvc := stats.New(chConn, st, cfg.VictoriaMetricsURL, log)
	ingestAuth := ingestauth.New(st, log, reg)

	// Pipeline service: validator (real collector binary) + distributor.
	validator := pipelines.NewValidator(cfg.OtelcolBin, log)
	var distributor pipelines.Distributor
	if cfg.Distributor == "k8s" {
		distributor, err = pipelines.NewK8sDistributor(cfg.K8sCRName, cfg.K8sCRNamespace)
		if err != nil {
			return fmt.Errorf("configure k8s distributor: %w", err)
		}
		log.Info("using k8s distributor", "cr", cfg.K8sCRNamespace+"/"+cfg.K8sCRName)
	} else {
		distributor = pipelines.NewPublishDistributor()
	}
	pipelinesSvc := pipelines.NewService(st, validator, distributor, cipher, log)

	// OpAMP server (edge-agent fleet management on :4320). The pipeline
	// service pushes edge-config changes through it; the OpAMP server renders
	// desired configs through the pipeline service.
	opampSrv := opamp.NewServer(st, pipelinesSvc, cfg.OpAMPAddr, log)
	pipelinesSvc.SetEdgeNotifier(opampSrv)

	// Alerting webhooks: the dispatcher consumes fleet events from the OpAMP
	// module through a bounded queue and delivers signed POSTs out of band.
	webhookDispatcher := webhooks.New(st, cipher, log)
	opampSrv.Handler().SetEventSink(webhookDispatcher)

	// Per-customer telemetry retention sweep.
	retentionSvc := retention.New(chConn, st, cfg.RetentionInterval, log)

	// Login provider registry: database providers + the OTELFLEET_OIDC_* env
	// provider, resolved per request under /auth/{name}/...
	authRegistry := auth.NewRegistry(cfg, st, cipher, sessions, log)

	// REST API server.
	server := api.NewServer(cfg, st, tenantsSvc, pipelinesSvc, statsSvc, sessions, authRegistry, cipher, opampSrv, webhookDispatcher, log)
	httpSrv := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: api.NewRouter(api.RouterDeps{
			Config:   cfg,
			Store:    st,
			Sessions: sessions,
			Server:   server,
			Auth:     authRegistry,
			Log:      log,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Internal gRPC server (plaintext in dev; cluster-internal only).
	grpcSrv := grpc.NewServer()
	authv1.RegisterAuthServiceServer(grpcSrv, ingestAuth)
	grpcLis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen grpc %s: %w", cfg.GRPCAddr, err)
	}

	// Ops server.
	opsSrv := &http.Server{
		Addr:              cfg.OpsAddr,
		Handler:           api.NewOpsHandler(reg, st.Ping, pipelinesSvc.RenderCurrent),
		ReadHeaderTimeout: 10 * time.Second,
	}

	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		log.Info("http server listening", "addr", cfg.HTTPAddr, "dev_login", cfg.DevLogin)
		if err := httpSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("http server: %w", err)
		}
		return nil
	})
	g.Go(func() error {
		log.Info("grpc server listening", "addr", cfg.GRPCAddr)
		if err := grpcSrv.Serve(grpcLis); err != nil {
			return fmt.Errorf("grpc server: %w", err)
		}
		return nil
	})
	g.Go(func() error {
		log.Info("ops server listening", "addr", cfg.OpsAddr)
		if err := opsSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("ops server: %w", err)
		}
		return nil
	})
	g.Go(func() error {
		ingestAuth.Run(gctx) // flushes batched last_used_at updates; final flush on cancel
		return nil
	})
	g.Go(func() error {
		webhookDispatcher.Run(gctx) // drains the event queue; stops on cancel
		return nil
	})
	g.Go(func() error {
		retentionSvc.Run(gctx) // nightly per-customer retention sweep
		return nil
	})
	g.Go(func() error {
		log.Info("opamp server listening", "addr", cfg.OpAMPAddr, "path", opamp.Path)
		if err := opampSrv.Start(); err != nil {
			return err
		}
		opampSrv.Run(gctx) // flushes write-behind heartbeat state; final flush on cancel
		return nil
	})
	g.Go(func() error {
		<-gctx.Done()
		log.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := httpSrv.Shutdown(shutdownCtx); err != nil {
			log.Warn("http shutdown", "err", err)
		}
		if err := opsSrv.Shutdown(shutdownCtx); err != nil {
			log.Warn("ops shutdown", "err", err)
		}
		if err := opampSrv.Stop(shutdownCtx); err != nil {
			log.Warn("opamp shutdown", "err", err)
		}
		grpcSrv.GracefulStop()
		return nil
	})

	err = g.Wait()
	log.Info("otelfleet stopped")
	return err
}

// waitForDB pings until the database answers or the timeout elapses; dev
// convenience so `make run` right after `make dev-up` does not race postgres.
func waitForDB(ctx context.Context, pool *pgxpool.Pool, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err := pool.Ping(pingCtx)
		cancel()
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}
