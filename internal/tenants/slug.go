package tenants

import (
	"regexp"
	"strings"
)

// slugPattern mirrors the OpenAPI CustomerCreate.slug pattern.
var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`)

// ValidSlug reports whether s is an acceptable customer slug.
func ValidSlug(s string) bool { return slugPattern.MatchString(s) }

// DeriveSlug derives a URL-safe slug from a customer name: lowercase, any run
// of non-alphanumeric characters becomes a single hyphen, trimmed to at most
// 64 characters. Names that yield fewer than 3 usable characters are padded
// so the result always satisfies ValidSlug.
func DeriveSlug(name string) string {
	var b strings.Builder
	lastHyphen := true // suppress leading hyphens
	for _, r := range strings.ToLower(name) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastHyphen = false
		default:
			if !lastHyphen {
				b.WriteByte('-')
				lastHyphen = true
			}
		}
	}
	s := strings.Trim(b.String(), "-")
	if len(s) > 64 {
		s = strings.Trim(s[:64], "-")
	}
	// The pattern requires at least 3 characters.
	for len(s) < 3 {
		if s == "" {
			s = "customer"
			break
		}
		s += "0"
	}
	return s
}
