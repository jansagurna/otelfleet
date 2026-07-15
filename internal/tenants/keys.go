package tenants

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// API key format: otm_<8 lowercase hex>_<43 chars base64url of 32 random bytes>.
// Only the SHA-256 of the full key is stored; the prefix ("otm_<hex>") is kept
// in clear for display and lookup.

// GeneratedKey is a freshly minted API key.
type GeneratedKey struct {
	// Secret is the full key, shown to the caller exactly once.
	Secret string
	// Prefix is the non-secret display/lookup prefix, e.g. "otm_ab12cd34".
	Prefix string
	// Hash is SHA-256(Secret).
	Hash []byte
}

// GenerateAPIKey mints a new API key.
func GenerateAPIKey() (GeneratedKey, error) {
	var buf [4 + 32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return GeneratedKey{}, fmt.Errorf("generate api key: %w", err)
	}
	prefix := "otm_" + hex.EncodeToString(buf[:4])
	secret := prefix + "_" + base64.RawURLEncoding.EncodeToString(buf[4:])
	return GeneratedKey{Secret: secret, Prefix: prefix, Hash: HashAPIKey(secret)}, nil
}

// HashAPIKey returns SHA-256 of the full key.
func HashAPIKey(key string) []byte {
	sum := sha256.Sum256([]byte(key))
	return sum[:]
}

// ParseKeyPrefix extracts the lookup prefix ("otm_<8 hex>") from a presented
// key. ok is false when the key does not have the otm_<prefix>_<secret> shape.
func ParseKeyPrefix(key string) (prefix string, ok bool) {
	parts := strings.SplitN(key, "_", 3)
	if len(parts) != 3 || parts[0] != "otm" || len(parts[1]) != 8 || parts[2] == "" {
		return "", false
	}
	for _, c := range parts[1] {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return "", false
		}
	}
	return "otm_" + parts[1], true
}
