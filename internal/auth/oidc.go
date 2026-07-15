package auth

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/sag-solutions/otelfleet/internal/authz"
	"github.com/sag-solutions/otelfleet/internal/config"
	"github.com/sag-solutions/otelfleet/internal/store"
)

// Session keys used during the OIDC dance.
const (
	sessOIDCState    = "oidc_state"
	sessOIDCVerifier = "oidc_verifier"
)

// UserUpserter is the subset of the store the OIDC handler needs.
type UserUpserter interface {
	UpsertUserByIdentity(ctx context.Context, provider, subject, email string, displayName *string, roleIfNew string) (store.User, error)
}

// OIDCHandler serves /auth/{name}/start and /auth/{name}/callback for one
// configured provider. The upstream provider metadata is discovered lazily so
// the control plane starts even when the IdP is briefly unreachable.
type OIDCHandler struct {
	cfg      config.OIDCProvider
	baseURL  string
	sessions *Sessions
	store    UserUpserter
	isAdmin  func(email string) bool
	log      *slog.Logger

	mu       sync.Mutex
	provider *oidc.Provider
}

// NewOIDCHandler wires an OIDC login flow for the given provider config.
func NewOIDCHandler(cfg config.OIDCProvider, baseURL string, sessions *Sessions, st UserUpserter, isAdmin func(string) bool, log *slog.Logger) *OIDCHandler {
	return &OIDCHandler{cfg: cfg, baseURL: baseURL, sessions: sessions, store: st, isAdmin: isAdmin, log: log}
}

// Name returns the provider's URL-safe name.
func (h *OIDCHandler) Name() string { return h.cfg.Name }

func (h *OIDCHandler) getProvider(ctx context.Context) (*oidc.Provider, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.provider != nil {
		return h.provider, nil
	}
	p, err := oidc.NewProvider(ctx, h.cfg.Issuer)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery for %s: %w", h.cfg.Issuer, err)
	}
	h.provider = p
	return p, nil
}

func (h *OIDCHandler) oauthConfig(p *oidc.Provider) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     h.cfg.ClientID,
		ClientSecret: h.cfg.ClientSecret,
		Endpoint:     p.Endpoint(),
		RedirectURL:  h.baseURL + "/auth/" + h.cfg.Name + "/callback",
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}
}

// Start redirects the browser to the IdP's authorization endpoint (PKCE S256,
// state bound to the session).
func (h *OIDCHandler) Start(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p, err := h.getProvider(ctx)
	if err != nil {
		h.log.Error("oidc start: discovery failed", "provider", h.cfg.Name, "err", err)
		http.Error(w, "identity provider unavailable", http.StatusBadGateway)
		return
	}
	state := newToken()
	verifier := oauth2.GenerateVerifier()
	h.sessions.Manager.Put(ctx, sessOIDCState, state)
	h.sessions.Manager.Put(ctx, sessOIDCVerifier, verifier)

	url := h.oauthConfig(p).AuthCodeURL(state, oauth2.S256ChallengeOption(verifier))
	http.Redirect(w, r, url, http.StatusFound)
}

// Callback finishes the flow: state check, code exchange (PKCE), ID token
// verification, user upsert and session login. On success it redirects to /.
func (h *OIDCHandler) Callback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	wantState := h.sessions.Manager.PopString(ctx, sessOIDCState)
	verifier := h.sessions.Manager.PopString(ctx, sessOIDCVerifier)
	if wantState == "" || r.URL.Query().Get("state") != wantState {
		http.Error(w, "invalid OIDC state", http.StatusBadRequest)
		return
	}
	if errCode := r.URL.Query().Get("error"); errCode != "" {
		h.log.Warn("oidc callback: provider returned error", "provider", h.cfg.Name, "error", errCode)
		http.Error(w, "login failed: "+errCode, http.StatusBadRequest)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing authorization code", http.StatusBadRequest)
		return
	}

	p, err := h.getProvider(ctx)
	if err != nil {
		h.log.Error("oidc callback: discovery failed", "provider", h.cfg.Name, "err", err)
		http.Error(w, "identity provider unavailable", http.StatusBadGateway)
		return
	}
	token, err := h.oauthConfig(p).Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		h.log.Warn("oidc callback: code exchange failed", "provider", h.cfg.Name, "err", err)
		http.Error(w, "code exchange failed", http.StatusBadGateway)
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		http.Error(w, "no id_token in token response", http.StatusBadGateway)
		return
	}
	idToken, err := p.Verifier(&oidc.Config{ClientID: h.cfg.ClientID}).Verify(ctx, rawIDToken)
	if err != nil {
		h.log.Warn("oidc callback: id token verification failed", "provider", h.cfg.Name, "err", err)
		http.Error(w, "invalid id_token", http.StatusBadRequest)
		return
	}

	var claims struct {
		Email         string `json:"email"`
		EmailVerified *bool  `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		http.Error(w, "cannot parse id_token claims", http.StatusBadRequest)
		return
	}
	if claims.Email == "" {
		http.Error(w, "id_token contains no email", http.StatusBadRequest)
		return
	}
	if claims.EmailVerified != nil && !*claims.EmailVerified {
		http.Error(w, "email not verified at identity provider", http.StatusForbidden)
		return
	}

	role := authz.RoleViewer
	if h.isAdmin(claims.Email) {
		role = authz.RoleAdmin
	}
	var displayName *string
	if claims.Name != "" {
		displayName = &claims.Name
	}
	user, err := h.store.UpsertUserByIdentity(ctx, "oidc:"+h.cfg.Name, idToken.Subject, claims.Email, displayName, role)
	if err != nil {
		h.log.Error("oidc callback: user upsert failed", "err", err)
		http.Error(w, "login failed", http.StatusInternalServerError)
		return
	}
	if user.DisabledAt != nil {
		http.Error(w, "account disabled", http.StatusForbidden)
		return
	}
	if err := h.sessions.Login(ctx, user.ID); err != nil {
		h.log.Error("oidc callback: session login failed", "err", err)
		http.Error(w, "login failed", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}
