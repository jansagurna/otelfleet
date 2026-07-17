package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/sag-solutions/otelfleet/internal/api/apigen"
	"github.com/sag-solutions/otelfleet/internal/auth"
	"github.com/sag-solutions/otelfleet/internal/authz"
	"github.com/sag-solutions/otelfleet/internal/config"
	"github.com/sag-solutions/otelfleet/internal/crypto"
	"github.com/sag-solutions/otelfleet/internal/pipelines"
	"github.com/sag-solutions/otelfleet/internal/stats"
	"github.com/sag-solutions/otelfleet/internal/store"
	"github.com/sag-solutions/otelfleet/internal/tenants"
)

// AgentConnections is the OpAMP-server subset the fleet handlers need (live
// connection check for the delete-agent 409). Implemented by *opamp.Server.
type AgentConnections interface {
	IsConnected(instanceUID []byte) bool
}

// Server implements the OpenAPI strict-server interface.
type Server struct {
	cfg       *config.Config
	store     store.Store
	tenants   *tenants.Service
	pipelines *pipelines.Service
	stats     *stats.Service
	sessions  *auth.Sessions
	authReg   *auth.Registry
	cipher    *crypto.Cipher   // nil: master key not configured
	agents    AgentConnections // nil: no OpAMP server (treated as disconnected)
	log       *slog.Logger
}

var _ apigen.StrictServerInterface = (*Server)(nil)

// NewServer wires the REST handlers.
func NewServer(cfg *config.Config, st store.Store, ten *tenants.Service, pipes *pipelines.Service, sts *stats.Service, sessions *auth.Sessions, authReg *auth.Registry, cipher *crypto.Cipher, agents AgentConnections, log *slog.Logger) *Server {
	return &Server{cfg: cfg, store: st, tenants: ten, pipelines: pipes, stats: sts, sessions: sessions, authReg: authReg, cipher: cipher, agents: agents, log: log}
}

func actorID(ctx context.Context) *openapi_types.UUID {
	if p, ok := auth.PrincipalFrom(ctx); ok {
		id := p.User.ID
		return &id
	}
	return nil
}

func toCustomer(c store.Customer) apigen.Customer {
	return apigen.Customer{
		Id:        c.ID,
		Slug:      c.Slug,
		Name:      c.Name,
		ClientId:  c.ClientID,
		Status:    apigen.CustomerStatus(c.Status),
		CreatedAt: c.CreatedAt,
	}
}

func toAPIKey(k store.APIKey) apigen.ApiKey {
	return apigen.ApiKey{
		Id:         k.ID,
		CustomerId: k.CustomerID,
		Name:       k.Name,
		KeyPrefix:  k.KeyPrefix,
		CreatedAt:  k.CreatedAt,
		ExpiresAt:  k.ExpiresAt,
		RevokedAt:  k.RevokedAt,
		LastUsedAt: k.LastUsedAt,
	}
}

func toAPIKeyCreated(k store.APIKey, secret string) apigen.ApiKeyCreated {
	return apigen.ApiKeyCreated{
		Id:         k.ID,
		CustomerId: k.CustomerID,
		Name:       k.Name,
		KeyPrefix:  k.KeyPrefix,
		CreatedAt:  k.CreatedAt,
		ExpiresAt:  k.ExpiresAt,
		RevokedAt:  k.RevokedAt,
		LastUsedAt: k.LastUsedAt,
		Secret:     secret,
	}
}

// --- auth ---

// GetMe returns the session user plus the CSRF token for mutating requests.
func (s *Server) GetMe(ctx context.Context, _ apigen.GetMeRequestObject) (apigen.GetMeResponseObject, error) {
	p, ok := auth.PrincipalFrom(ctx)
	if !ok { // unreachable: Guard rejects unauthenticated requests first
		return apigen.GetMe401JSONResponse{UnauthorizedJSONResponse: apigen.UnauthorizedJSONResponse{Code: codeUnauthorized, Message: "authentication required"}}, nil
	}
	return apigen.GetMe200JSONResponse{
		Id:          p.User.ID,
		Email:       openapi_types.Email(p.User.Email),
		DisplayName: p.User.DisplayName,
		Role:        apigen.Role(p.User.Role),
		CsrfToken:   p.CSRFToken,
	}, nil
}

// ListAuthProviders is public: the login page needs it before any session.
// It offers the enabled database providers plus the environment provider.
func (s *Server) ListAuthProviders(ctx context.Context, _ apigen.ListAuthProvidersRequestObject) (apigen.ListAuthProvidersResponseObject, error) {
	list, err := s.authReg.LoginProviders(ctx)
	if err != nil {
		return nil, err
	}
	providers := []apigen.AuthProvider{}
	for _, p := range list {
		providers = append(providers, apigen.AuthProvider{
			Name:        p.Name,
			DisplayName: p.DisplayName,
			LoginUrl:    "/auth/" + p.Name + "/start",
		})
	}
	return apigen.ListAuthProviders200JSONResponse{
		Providers:       providers,
		DevLoginEnabled: s.cfg.DevLogin,
	}, nil
}

// DevLogin signs in by bare email; enabled only with OTELFLEET_DEV_LOGIN=true.
func (s *Server) DevLogin(ctx context.Context, request apigen.DevLoginRequestObject) (apigen.DevLoginResponseObject, error) {
	if !s.cfg.DevLogin {
		return apigen.DevLogin403JSONResponse{ForbiddenJSONResponse: apigen.ForbiddenJSONResponse{Code: codeForbidden, Message: "dev login is disabled"}}, nil
	}
	email := strings.ToLower(strings.TrimSpace(string(request.Body.Email)))
	if email == "" || !strings.Contains(email, "@") {
		return devLoginErrResponse{errResp(http.StatusBadRequest, codeBadRequest, "invalid email")}, nil
	}
	role := authz.RoleViewer
	if s.cfg.IsAdminEmail(email) {
		role = authz.RoleAdmin
	}
	user, err := s.store.UpsertUserByIdentity(ctx, "dev", email, email, nil, role)
	if err != nil {
		return nil, err
	}
	if user.DisabledAt != nil {
		return apigen.DevLogin403JSONResponse{ForbiddenJSONResponse: apigen.ForbiddenJSONResponse{Code: codeForbidden, Message: "account disabled"}}, nil
	}
	if err := s.sessions.Login(ctx, user.ID); err != nil {
		return nil, err
	}
	return apigen.DevLogin204Response{}, nil
}

// Logout destroys the current session.
func (s *Server) Logout(ctx context.Context, _ apigen.LogoutRequestObject) (apigen.LogoutResponseObject, error) {
	if err := s.sessions.Logout(ctx); err != nil {
		return nil, err
	}
	return apigen.Logout204Response{}, nil
}

// --- customers ---

func (s *Server) ListCustomers(ctx context.Context, request apigen.ListCustomersRequestObject) (apigen.ListCustomersResponseObject, error) {
	var status *string
	if request.Params.Status != nil {
		v := string(*request.Params.Status)
		status = &v
	}
	customers, err := s.store.ListCustomers(ctx, status)
	if err != nil {
		return nil, err
	}
	out := make([]apigen.Customer, 0, len(customers))
	for _, c := range customers {
		out = append(out, toCustomer(c))
	}
	return apigen.ListCustomers200JSONResponse{Customers: out}, nil
}

func (s *Server) CreateCustomer(ctx context.Context, request apigen.CreateCustomerRequestObject) (apigen.CreateCustomerResponseObject, error) {
	created, err := s.tenants.CreateCustomer(ctx, actorID(ctx), request.Body.Name, request.Body.Slug)
	switch {
	case errors.Is(err, tenants.ErrInvalidName), errors.Is(err, tenants.ErrInvalidSlug):
		return apigen.CreateCustomer400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: err.Error()}}, nil
	case errors.Is(err, store.ErrSlugExists):
		return apigen.CreateCustomer409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "slug already exists"}}, nil
	case err != nil:
		return nil, err
	}
	return apigen.CreateCustomer201JSONResponse{
		Customer:      toCustomer(created.Customer),
		InitialApiKey: toAPIKeyCreated(created.Key, created.Secret),
	}, nil
}

func (s *Server) GetCustomer(ctx context.Context, request apigen.GetCustomerRequestObject) (apigen.GetCustomerResponseObject, error) {
	c, err := s.store.GetCustomer(ctx, request.CustomerId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.GetCustomer404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.GetCustomer200JSONResponse(toCustomer(c)), nil
}

func (s *Server) UpdateCustomer(ctx context.Context, request apigen.UpdateCustomerRequestObject) (apigen.UpdateCustomerResponseObject, error) {
	upd := store.CustomerUpdate{Name: request.Body.Name}
	if request.Body.Status != nil {
		v := string(*request.Body.Status)
		upd.Status = &v
	}
	c, err := s.tenants.UpdateCustomer(ctx, actorID(ctx), request.CustomerId, upd)
	switch {
	case errors.Is(err, tenants.ErrInvalidName):
		// The contract enumerates no 400 for PATCH; the router's response
		// error handler maps badRequestError to a 400 Error body.
		return nil, badRequestError{err}
	case errors.Is(err, store.ErrNotFound):
		return apigen.UpdateCustomer404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	case err != nil:
		return nil, err
	}
	return apigen.UpdateCustomer200JSONResponse(toCustomer(c)), nil
}

func (s *Server) DeleteCustomer(ctx context.Context, request apigen.DeleteCustomerRequestObject) (apigen.DeleteCustomerResponseObject, error) {
	err := s.tenants.DeleteCustomer(ctx, actorID(ctx), request.CustomerId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.DeleteCustomer404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.DeleteCustomer204Response{}, nil
}

// --- api keys ---

func (s *Server) ListApiKeys(ctx context.Context, request apigen.ListApiKeysRequestObject) (apigen.ListApiKeysResponseObject, error) {
	keys, err := s.store.ListAPIKeys(ctx, request.CustomerId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.ListApiKeys404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]apigen.ApiKey, 0, len(keys))
	for _, k := range keys {
		out = append(out, toAPIKey(k))
	}
	return apigen.ListApiKeys200JSONResponse{ApiKeys: out}, nil
}

func (s *Server) CreateApiKey(ctx context.Context, request apigen.CreateApiKeyRequestObject) (apigen.CreateApiKeyResponseObject, error) {
	created, err := s.tenants.CreateAPIKey(ctx, actorID(ctx), request.CustomerId, request.Body.Name, request.Body.ExpiresAt)
	switch {
	case errors.Is(err, tenants.ErrInvalidName):
		return createAPIKeyErrResponse{errResp(http.StatusBadRequest, codeBadRequest, err.Error())}, nil
	case errors.Is(err, store.ErrNotFound):
		return apigen.CreateApiKey404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	case err != nil:
		return nil, err
	}
	return apigen.CreateApiKey201JSONResponse(toAPIKeyCreated(created.Key, created.Secret)), nil
}

func (s *Server) RevokeApiKey(ctx context.Context, request apigen.RevokeApiKeyRequestObject) (apigen.RevokeApiKeyResponseObject, error) {
	err := s.tenants.RevokeAPIKey(ctx, actorID(ctx), request.CustomerId, request.KeyId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.RevokeApiKey404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "api key not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.RevokeApiKey204Response{}, nil
}

// --- stats ---

func (s *Server) GetStatsOverview(ctx context.Context, request apigen.GetStatsOverviewRequestObject) (apigen.GetStatsOverviewResponseObject, error) {
	from, to := request.Params.From, request.Params.To
	if !to.After(from) {
		return statsOverviewErrResponse{errResp(http.StatusBadRequest, codeBadRequest, "'to' must be after 'from'")}, nil
	}
	ov, err := s.stats.GetOverview(ctx, from, to)
	if errors.Is(err, stats.ErrUpstreamUnavailable) {
		return statsOverviewErrResponse{errResp(http.StatusServiceUnavailable, codeUpstream, "stats backend unavailable")}, nil
	}
	if err != nil {
		return nil, err
	}

	resp := apigen.GetStatsOverview200JSONResponse{
		ActiveCustomers: ov.ActiveCustomers,
		RefusedRequests: &ov.RefusedRequests,
	}
	resp.Totals.Logs = ov.Totals["logs"]
	resp.Totals.Traces = ov.Totals["traces"]
	resp.Totals.Metrics = ov.Totals["metrics"]
	resp.TopCustomers = make([]struct {
		CustomerId openapi_types.UUID `json:"customerId"`
		Items      int64              `json:"items"`
		Name       string             `json:"name"`
	}, 0, len(ov.TopCustomers))
	for _, tc := range ov.TopCustomers {
		resp.TopCustomers = append(resp.TopCustomers, struct {
			CustomerId openapi_types.UUID `json:"customerId"`
			Items      int64              `json:"items"`
			Name       string             `json:"name"`
		}{CustomerId: tc.CustomerID, Items: tc.Items, Name: tc.Name})
	}
	return resp, nil
}

func (s *Server) GetCustomerThroughput(ctx context.Context, request apigen.GetCustomerThroughputRequestObject) (apigen.GetCustomerThroughputResponseObject, error) {
	from, to := request.Params.From, request.Params.To
	if !to.After(from) {
		return throughputErrResponse{errResp(http.StatusBadRequest, codeBadRequest, "'to' must be after 'from'")}, nil
	}
	step, err := stats.ParseStep(request.Params.Step)
	if err != nil {
		return throughputErrResponse{errResp(http.StatusBadRequest, codeBadRequest, err.Error())}, nil
	}
	var signal *string
	if request.Params.Signal != nil {
		v := string(*request.Params.Signal)
		signal = &v
	}

	series, err := s.stats.GetThroughput(ctx, request.CustomerId, signal, from, to, step)
	switch {
	case errors.Is(err, store.ErrNotFound):
		return apigen.GetCustomerThroughput404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	case errors.Is(err, stats.ErrUpstreamUnavailable):
		return throughputErrResponse{errResp(http.StatusServiceUnavailable, codeUpstream, "stats backend unavailable")}, nil
	case err != nil:
		return nil, err
	}

	out := apigen.ThroughputResponse{Series: make([]apigen.ThroughputSeries, 0, len(series))}
	for _, sr := range series {
		points := make([]apigen.ThroughputPoint, 0, len(sr.Points))
		for _, p := range sr.Points {
			points = append(points, apigen.ThroughputPoint{Ts: p.Ts, Value: float32(p.Value)})
		}
		out.Series = append(out.Series, apigen.ThroughputSeries{Signal: apigen.Signal(sr.Signal), Points: points})
	}
	return apigen.GetCustomerThroughput200JSONResponse(out), nil
}

// badRequestError marks handler errors that must surface as 400 rather than
// 500; the router's ResponseErrorHandlerFunc unwraps it.
type badRequestError struct{ err error }

func (e badRequestError) Error() string { return e.err.Error() }
func (e badRequestError) Unwrap() error { return e.err }
