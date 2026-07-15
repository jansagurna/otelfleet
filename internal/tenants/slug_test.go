package tenants

import "testing"

func TestDeriveSlug(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"ACME Corp", "acme-corp"},
		{"acme", "acme"},
		{"  Müller & Söhne GmbH  ", "m-ller-s-hne-gmbh"},
		{"foo---bar", "foo-bar"},
		{"--leading and trailing--", "leading-and-trailing"},
		{"UPPER", "upper"},
		{"a", "a00"},  // padded to the 3-char minimum
		{"9!", "900"}, // padded to the 3-char minimum
		{"héllo wörld 42", "h-llo-w-rld-42"},
		{"!!!", "customer"}, // nothing usable at all
		{"", "customer"},
	}
	for _, c := range cases {
		got := DeriveSlug(c.name)
		if got != c.want {
			t.Errorf("DeriveSlug(%q) = %q, want %q", c.name, got, c.want)
		}
		if !ValidSlug(got) {
			t.Errorf("DeriveSlug(%q) = %q is not a valid slug", c.name, got)
		}
	}
}

func TestDeriveSlugTruncates(t *testing.T) {
	long := ""
	for range 30 {
		long += "abc "
	}
	got := DeriveSlug(long)
	if len(got) > 64 {
		t.Errorf("DeriveSlug of long name = %d chars, want <= 64", len(got))
	}
	if !ValidSlug(got) {
		t.Errorf("truncated slug %q is not valid", got)
	}
}

func TestValidSlug(t *testing.T) {
	valid := []string{"abc", "acme-corp", "a1b", "0-0-0"}
	invalid := []string{"", "ab", "-abc", "abc-", "ABC", "a_b_c", "a b"}
	for _, s := range valid {
		if !ValidSlug(s) {
			t.Errorf("ValidSlug(%q) = false, want true", s)
		}
	}
	for _, s := range invalid {
		if ValidSlug(s) {
			t.Errorf("ValidSlug(%q) = true, want false", s)
		}
	}
}
