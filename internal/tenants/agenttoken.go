package tenants

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// Per-agent OpAMP token format: otm_at_<8 lowercase hex>_<43 chars base64url of
// 32 random bytes>. Same construction as the bootstrap token (otm_bt_) and
// ingest API key (otm_); only the SHA-256 is stored, the prefix is kept in
// clear for O(1) lookup.

// GenerateAgentToken mints a new per-agent OpAMP token.
func GenerateAgentToken() (GeneratedKey, error) {
	var buf [4 + 32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return GeneratedKey{}, fmt.Errorf("generate agent token: %w", err)
	}
	prefix := "otm_at_" + hex.EncodeToString(buf[:4])
	secret := prefix + "_" + base64.RawURLEncoding.EncodeToString(buf[4:])
	return GeneratedKey{Secret: secret, Prefix: prefix, Hash: HashAPIKey(secret)}, nil
}

// ParseAgentTokenPrefix extracts the lookup prefix ("otm_at_<8 hex>") from a
// presented token. ok is false when the token is not shaped otm_at_<prefix>_<secret>.
func ParseAgentTokenPrefix(token string) (prefix string, ok bool) {
	parts := strings.SplitN(token, "_", 4)
	if len(parts) != 4 || parts[0] != "otm" || parts[1] != "at" || len(parts[2]) != 8 || parts[3] == "" {
		return "", false
	}
	for _, c := range parts[2] {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return "", false
		}
	}
	return "otm_at_" + parts[2], true
}
