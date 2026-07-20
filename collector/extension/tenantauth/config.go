// Copyright The otelfleet Authors
// SPDX-License-Identifier: Apache-2.0

package tenantauth // import "github.com/jansagurna/otelfleet/collector/extension/tenantauth"

import (
	"errors"
	"time"
)

// CacheConfig controls the in-memory API-key validation cache.
type CacheConfig struct {
	// TTL is the maximum time a positive validation result is served without
	// re-checking the control plane. The effective TTL per key is
	// min(TTL, ValidateAPIKeyResponse.cache_ttl_seconds) when the server
	// returns a non-zero cache_ttl_seconds.
	TTL time.Duration `mapstructure:"ttl"`
	// NegativeTTL is how long a rejected key stays cached as invalid.
	NegativeTTL time.Duration `mapstructure:"negative_ttl"`
	// MaxEntries bounds the cache size; least-recently-used entries are evicted.
	MaxEntries int `mapstructure:"max_entries"`
	// StaleIfError is how long an expired positive entry may still be served
	// when the control plane is unreachable (fail-open for known keys).
	StaleIfError time.Duration `mapstructure:"stale_if_error"`
}

// Config for the tenantauth server authenticator extension.
type Config struct {
	// Endpoint is the control-plane gRPC address exposing
	// otelfleet.auth.v1.AuthService (e.g. "host.docker.internal:9443").
	Endpoint string `mapstructure:"endpoint"`
	// Insecure disables transport security (dev only; the AuthService
	// listener must never be reachable from outside the cluster).
	Insecure bool `mapstructure:"insecure"`

	Cache CacheConfig `mapstructure:"cache"`
}

func (cfg *Config) Validate() error {
	var errs []error
	if cfg.Endpoint == "" {
		errs = append(errs, errors.New("endpoint must be set to the control-plane AuthService gRPC address"))
	}
	if cfg.Cache.TTL <= 0 {
		errs = append(errs, errors.New("cache.ttl must be positive"))
	}
	if cfg.Cache.NegativeTTL <= 0 {
		errs = append(errs, errors.New("cache.negative_ttl must be positive"))
	}
	if cfg.Cache.MaxEntries <= 0 {
		errs = append(errs, errors.New("cache.max_entries must be positive"))
	}
	if cfg.Cache.StaleIfError < 0 {
		errs = append(errs, errors.New("cache.stale_if_error must not be negative"))
	}
	return errors.Join(errs...)
}
