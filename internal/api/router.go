package api

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/jansagurna/otelfleet/internal/api/apigen"
	"github.com/jansagurna/otelfleet/internal/auth"
	"github.com/jansagurna/otelfleet/internal/config"
	"github.com/jansagurna/otelfleet/internal/store"
)

// RouterDeps carries everything the HTTP router needs.
type RouterDeps struct {
	Config   *config.Config
	Store    store.Store
	Sessions *auth.Sessions
	Server   *Server
	Auth     *auth.Registry
	Log      *slog.Logger
}

// NewRouter assembles the public HTTP surface: the REST API under /api/v1
// (session-guarded), the SSO browser flows under /auth/{name}/... (providers
// resolved at request time from the database + environment), and the SPA
// fallback.
func NewRouter(d RouterDeps) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(requestLogger(d.Log))
	r.Use(chimw.Recoverer)
	r.Use(d.Sessions.Manager.LoadAndSave)

	r.Get("/auth/{provider}/start", d.Auth.Start)
	r.Get("/auth/{provider}/callback", d.Auth.Callback)

	strict := apigen.NewStrictHandlerWithOptions(d.Server, nil, apigen.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			var bad badRequestError
			if errors.As(err, &bad) {
				writeError(w, http.StatusBadRequest, codeBadRequest, bad.Error())
				return
			}
			d.Log.Error("handler failed", "method", r.Method, "path", r.URL.Path, "err", err)
			writeError(w, http.StatusInternalServerError, codeInternal, "internal server error")
		},
	})
	r.Group(func(g chi.Router) {
		g.Use(Guard(d.Sessions, d.Store))
		g.Use(captureRawBody)
		apigen.HandlerWithOptions(strict, apigen.ChiServerOptions{
			BaseRouter: g,
			ErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
				writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
			},
		})
	})

	r.NotFound(spaHandler(d.Config.WebDir))
	return r
}

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			log.Info("http request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"duration_ms", time.Since(start).Milliseconds(),
			)
		})
	}
}
