// Package config loads the otelfleet control-plane configuration from
// environment variables. All variables use the OTELFLEET_ prefix.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// OIDCProvider describes the env-defined fallback OIDC provider. Additional
// providers are managed in the database (Settings -> SSO) via internal/auth's
// registry; this one keeps single-provider deployments configurable without
// touching the UI.
type OIDCProvider struct {
	// Name is the URL-safe provider identifier (used in /auth/{name}/start).
	Name string
	// DisplayName is shown on the login page.
	DisplayName  string
	Issuer       string
	ClientID     string
	ClientSecret string
}

// Config is the full runtime configuration of the control plane.
type Config struct {
	DatabaseURL string

	ClickHouseAddr     string
	ClickHouseDatabase string
	ClickHouseUser     string
	ClickHousePassword string

	VictoriaMetricsURL string

	HTTPAddr  string
	GRPCAddr  string
	OpsAddr   string
	OpAMPAddr string

	BaseURL string
	WebDir  string

	DevLogin      bool
	AdminEmails   []string
	SessionSecure bool

	// MasterKeyBase64 is OTELFLEET_MASTER_KEY: the base64-encoded 32-byte key
	// for envelope encryption of secrets at rest (auth-provider client
	// secrets, pipeline exporter credentials). Empty = not configured; the
	// server boots, but features that need it fail with a clear error.
	// Validity (base64, length) is checked by crypto.New at wiring time.
	MasterKeyBase64 string

	// OtelcolBin is the collector distro binary used for `otelcol validate`;
	// when missing, pipeline validation degrades to structural checks.
	OtelcolBin string
	// Distributor selects how rendered forwarding configs are rolled out:
	// "publish" (ops endpoint + collector restart) or "k8s" (patch the
	// OpenTelemetryCollector CR named below).
	Distributor    string
	K8sCRName      string
	K8sCRNamespace string

	// OIDCProviders holds every configured OIDC provider. In Phase 1 at most
	// one (the generic OTELFLEET_OIDC_* provider) is present.
	OIDCProviders []OIDCProvider
}

// Load reads the configuration from the process environment.
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:        env("DATABASE_URL", "postgres://otelfleet:otelfleet@localhost:5432/otelfleet"),
		ClickHouseAddr:     env("CLICKHOUSE_ADDR", "localhost:9000"),
		ClickHouseDatabase: env("CLICKHOUSE_DATABASE", "otel"),
		ClickHouseUser:     env("CLICKHOUSE_USER", "otelfleet"),
		ClickHousePassword: env("CLICKHOUSE_PASSWORD", "otelfleet"),
		VictoriaMetricsURL: env("VICTORIAMETRICS_URL", "http://localhost:8428"),
		HTTPAddr:           env("HTTP_ADDR", ":8080"),
		GRPCAddr:           env("GRPC_ADDR", ":9443"),
		OpsAddr:            env("OPS_ADDR", ":9090"),
		OpAMPAddr:          env("OPAMP_ADDR", ":4320"),
		BaseURL:            strings.TrimSuffix(env("BASE_URL", "http://localhost:8080"), "/"),
		WebDir:             env("WEB_DIR", ""),
		OtelcolBin:         env("OTELCOL_BIN", "collector/dist/otelfleet-collector"),
		Distributor:        env("DISTRIBUTOR", "publish"),
		K8sCRName:          env("K8S_CR_NAME", "otelfleet-forwarding"),
		K8sCRNamespace:     env("K8S_CR_NAMESPACE", "otelfleet"),
		MasterKeyBase64:    env("MASTER_KEY", ""),
	}
	if cfg.Distributor != "publish" && cfg.Distributor != "k8s" {
		return nil, fmt.Errorf("OTELFLEET_DISTRIBUTOR must be 'publish' or 'k8s', got %q", cfg.Distributor)
	}

	var err error
	if cfg.DevLogin, err = envBool("DEV_LOGIN", false); err != nil {
		return nil, err
	}
	if cfg.SessionSecure, err = envBool("SESSION_SECURE", false); err != nil {
		return nil, err
	}

	for _, e := range strings.Split(env("ADMIN_EMAILS", ""), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			cfg.AdminEmails = append(cfg.AdminEmails, e)
		}
	}

	if issuer := env("OIDC_ISSUER", ""); issuer != "" {
		p := OIDCProvider{
			Name:         "oidc",
			DisplayName:  env("OIDC_NAME", "SSO"),
			Issuer:       issuer,
			ClientID:     env("OIDC_CLIENT_ID", ""),
			ClientSecret: env("OIDC_CLIENT_SECRET", ""),
		}
		if p.ClientID == "" {
			return nil, fmt.Errorf("OTELFLEET_OIDC_ISSUER is set but OTELFLEET_OIDC_CLIENT_ID is empty")
		}
		cfg.OIDCProviders = append(cfg.OIDCProviders, p)
	}

	return cfg, nil
}

// IsAdminEmail reports whether email is listed in OTELFLEET_ADMIN_EMAILS.
func (c *Config) IsAdminEmail(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	for _, a := range c.AdminEmails {
		if a == email {
			return true
		}
	}
	return false
}

func env(key, def string) string {
	if v, ok := os.LookupEnv("OTELFLEET_" + key); ok {
		return v
	}
	return def
}

func envBool(key string, def bool) (bool, error) {
	v, ok := os.LookupEnv("OTELFLEET_" + key)
	if !ok || v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("OTELFLEET_%s: invalid boolean %q", key, v)
	}
	return b, nil
}
