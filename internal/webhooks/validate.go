package webhooks

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ValidateURL enforces webhook-target hygiene: https:// everywhere, http://
// only for loopback targets (local development), and no link-local /
// metadata / unspecified addresses (SSRF hygiene, e.g. 169.254.169.254).
func ValidateURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("invalid URL: %v", err)
	}
	host := u.Hostname()
	if host == "" {
		return errors.New("URL must include a host")
	}

	ip := net.ParseIP(host)
	if ip != nil {
		if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return errors.New("link-local and metadata addresses are not allowed")
		}
	}

	switch u.Scheme {
	case "https":
		return nil
	case "http":
		if isLoopbackHost(host, ip) {
			return nil
		}
		return errors.New("http:// is only allowed for localhost targets; use https://")
	default:
		return errors.New("URL must use https:// (http:// only for localhost)")
	}
}

func isLoopbackHost(host string, ip net.IP) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	return ip != nil && ip.IsLoopback()
}
