package api

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
)

// rawBodyKey carries the buffered JSON request body through the context for
// handlers that need key-presence information the generated (decoded) body
// types cannot express.
type rawBodyKey struct{}

// rawBodyLimit bounds how much request body is buffered (the customer PATCH
// body is tiny; anything bigger is abusive).
const rawBodyLimit = 1 << 20

// captureRawBody buffers the body of customer PATCH requests and stashes it
// in the request context before the strict-server wrapper consumes it. The
// UpdateCustomer handler side-parses it to distinguish an absent
// rateLimitItemsPerSec/retentionDays key (unchanged) from an explicit null
// (clear) — oapi-codegen decodes both to a nil pointer.
func captureRawBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch && strings.HasPrefix(r.URL.Path, "/api/v1/customers/") && r.Body != nil {
			body, err := io.ReadAll(io.LimitReader(r.Body, rawBodyLimit))
			if err == nil {
				r.Body = io.NopCloser(bytes.NewReader(body))
				r = r.WithContext(context.WithValue(r.Context(), rawBodyKey{}, body))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// rawBodyFrom returns the buffered request body, if captureRawBody saw one.
func rawBodyFrom(ctx context.Context) ([]byte, bool) {
	b, ok := ctx.Value(rawBodyKey{}).([]byte)
	return b, ok
}
