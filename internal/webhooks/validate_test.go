package webhooks

import "testing"

func TestValidateURL(t *testing.T) {
	cases := []struct {
		url string
		ok  bool
	}{
		{"https://alerts.example.com/hook", true},
		{"https://10.0.0.5/hook", true}, // private but not link-local: allowed
		{"http://localhost:9000/hook", true},
		{"http://127.0.0.1:9000/hook", true},
		{"http://alerts.example.com/hook", false}, // http to non-loopback
		{"http://169.254.169.254/latest", false},  // cloud metadata (link-local)
		{"https://169.254.169.254/latest", false},  // link-local, any scheme
		{"https://0.0.0.0/hook", false},            // unspecified
		{"ftp://example.com/hook", false},          // wrong scheme
		{"https://", false},                        // no host
		{"::not a url::", false},
	}
	for _, tc := range cases {
		err := ValidateURL(tc.url)
		if tc.ok && err != nil {
			t.Errorf("ValidateURL(%q) = %v, want ok", tc.url, err)
		}
		if !tc.ok && err == nil {
			t.Errorf("ValidateURL(%q) = nil, want error", tc.url)
		}
	}
}
