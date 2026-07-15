package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// spaHandler serves the single-page app from webDir: existing files verbatim,
// anything else falls back to index.html (client-side routing). Unknown /api
// or /auth paths return JSON/plain 404 instead. With no webDir configured all
// non-API paths are 404.
func spaHandler(webDir string) http.HandlerFunc {
	var fileServer http.Handler
	if webDir != "" {
		fileServer = http.FileServer(http.Dir(webDir))
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeError(w, http.StatusNotFound, codeNotFound, "no such endpoint")
			return
		}
		if fileServer == nil || strings.HasPrefix(r.URL.Path, "/auth/") {
			http.NotFound(w, r)
			return
		}
		clean := filepath.Join(webDir, filepath.FromSlash(path200(r.URL.Path)))
		if info, err := os.Stat(clean); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
	}
}

// path200 normalizes a request path for a safe filesystem lookup.
func path200(p string) string {
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return filepath.Clean(p)
}
