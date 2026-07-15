package tenants

import (
	"bytes"
	"crypto/sha256"
	"regexp"
	"testing"
)

var keyFormat = regexp.MustCompile(`^otm_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$`)

func TestGenerateAPIKeyRoundtrip(t *testing.T) {
	key, err := GenerateAPIKey()
	if err != nil {
		t.Fatalf("GenerateAPIKey: %v", err)
	}
	if !keyFormat.MatchString(key.Secret) {
		t.Errorf("secret %q does not match otm_<8 hex>_<43 base64url>", key.Secret)
	}
	if want := key.Secret[:12]; key.Prefix != want {
		t.Errorf("prefix = %q, want %q", key.Prefix, want)
	}

	// Hash is SHA-256 of the full secret.
	sum := sha256.Sum256([]byte(key.Secret))
	if !bytes.Equal(key.Hash, sum[:]) {
		t.Error("Hash is not SHA-256(Secret)")
	}
	if !bytes.Equal(HashAPIKey(key.Secret), key.Hash) {
		t.Error("HashAPIKey(Secret) != Hash")
	}

	// Parsing the presented key recovers the lookup prefix.
	prefix, ok := ParseKeyPrefix(key.Secret)
	if !ok || prefix != key.Prefix {
		t.Errorf("ParseKeyPrefix(%q) = %q, %v; want %q, true", key.Secret, prefix, ok, key.Prefix)
	}
}

func TestGenerateAPIKeyUnique(t *testing.T) {
	seen := map[string]bool{}
	for range 100 {
		k, err := GenerateAPIKey()
		if err != nil {
			t.Fatalf("GenerateAPIKey: %v", err)
		}
		if seen[k.Secret] {
			t.Fatal("duplicate secret generated")
		}
		seen[k.Secret] = true
	}
}

func TestParseKeyPrefixRejectsMalformed(t *testing.T) {
	bad := []string{
		"",
		"otm",
		"otm_",
		"otm_ab12cd34",              // no secret part
		"otm_ab12cd34_",             // empty secret part
		"otm_ABCDEF12_secret",       // uppercase hex
		"otm_ab12cd3_secret",        // 7-char prefix
		"otm_ab12cd345_secret",      // 9-char prefix
		"xtm_ab12cd34_secret",       // wrong scheme
		"otm_zz12cd34_secret",       // non-hex chars
		"Bearer otm_ab12cd34_abcde", // junk around it
	}
	for _, k := range bad {
		if p, ok := ParseKeyPrefix(k); ok {
			t.Errorf("ParseKeyPrefix(%q) = %q, true; want false", k, p)
		}
	}

	if p, ok := ParseKeyPrefix("otm_ab12cd34_som_e_secret"); !ok || p != "otm_ab12cd34" {
		t.Errorf("ParseKeyPrefix with underscores in secret = %q, %v; want otm_ab12cd34, true", p, ok)
	}
}
