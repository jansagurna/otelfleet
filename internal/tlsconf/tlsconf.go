// Package tlsconf builds tls.Config values for the control-plane listeners
// from PEM files. All listeners are plaintext unless a cert/key is configured,
// so dev and single-node setups keep working unchanged; production terminates
// TLS here (or at an ingress in front).
package tlsconf

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// Server returns a TLS server config for certFile/keyFile with a modern floor
// (TLS 1.2+). Returns nil, nil when both paths are empty (plaintext).
func Server(certFile, keyFile string) (*tls.Config, error) {
	if certFile == "" && keyFile == "" {
		return nil, nil
	}
	if certFile == "" || keyFile == "" {
		return nil, fmt.Errorf("both cert and key files are required for TLS")
	}
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("load key pair: %w", err)
	}
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}, nil
}

// MutualServer builds on Server and, when clientCAFile is set, requires and
// verifies a client certificate signed by that CA (mTLS). This is how the
// internal gRPC AuthService can restrict callers to the gateway collectors.
func MutualServer(certFile, keyFile, clientCAFile string) (*tls.Config, error) {
	cfg, err := Server(certFile, keyFile)
	if err != nil || cfg == nil {
		return cfg, err
	}
	if clientCAFile == "" {
		return cfg, nil
	}
	pem, err := os.ReadFile(clientCAFile)
	if err != nil {
		return nil, fmt.Errorf("read client CA: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("client CA %s contains no certificates", clientCAFile)
	}
	cfg.ClientCAs = pool
	cfg.ClientAuth = tls.RequireAndVerifyClientCert
	return cfg, nil
}
