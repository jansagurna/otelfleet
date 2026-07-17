package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"golang.org/x/oauth2"
)

// GitHub OAuth2 endpoints and API. GitHub is OAuth2-only (no OIDC discovery,
// no ID tokens): after the code exchange the user identity comes from the
// REST API (/user + /user/emails for the primary verified email).
const (
	githubAuthURL  = "https://github.com/login/oauth/authorize"
	githubTokenURL = "https://github.com/login/oauth/access_token" //nolint:gosec // endpoint URL, not a credential
	githubAPIBase  = "https://api.github.com"
)

// GitHubHandler serves /auth/{name}/start and /auth/{name}/callback for a
// GitHub provider.
type GitHubHandler struct {
	info    ProviderInfo
	baseURL string
	finish  loginFinisher
	log     *slog.Logger
}

// NewGitHubHandler wires a GitHub login flow for the given resolved provider.
func NewGitHubHandler(info ProviderInfo, baseURL string, finisher loginFinisher) *GitHubHandler {
	return &GitHubHandler{info: info, baseURL: baseURL, finish: finisher, log: finisher.log}
}

// Name returns the provider's URL-safe name.
func (h *GitHubHandler) Name() string { return h.info.Name }

func (h *GitHubHandler) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     h.info.ClientID,
		ClientSecret: h.info.ClientSecret,
		Endpoint:     oauth2.Endpoint{AuthURL: githubAuthURL, TokenURL: githubTokenURL},
		RedirectURL:  h.baseURL + "/auth/" + h.info.Name + "/callback",
		Scopes:       []string{"read:user", "user:email"},
	}
}

// Start redirects the browser to GitHub's authorization page (state bound to
// the session; GitHub OAuth apps do not support PKCE).
func (h *GitHubHandler) Start(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := newToken()
	h.finish.sessions.Manager.Put(ctx, sessOIDCState, state)
	http.Redirect(w, r, h.oauthConfig().AuthCodeURL(state), http.StatusFound)
}

// Callback finishes the flow: state check, code exchange, user lookup via the
// GitHub API, user upsert and session login. On success it redirects to /.
func (h *GitHubHandler) Callback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	wantState := h.finish.sessions.Manager.PopString(ctx, sessOIDCState)
	if wantState == "" || r.URL.Query().Get("state") != wantState {
		http.Error(w, "invalid OAuth state", http.StatusBadRequest)
		return
	}
	if errCode := r.URL.Query().Get("error"); errCode != "" {
		h.log.Warn("github callback: provider returned error", "provider", h.info.Name, "error", errCode)
		http.Error(w, "login failed: "+errCode, http.StatusBadRequest)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing authorization code", http.StatusBadRequest)
		return
	}

	token, err := h.oauthConfig().Exchange(ctx, code)
	if err != nil {
		h.log.Warn("github callback: code exchange failed", "provider", h.info.Name, "err", err)
		http.Error(w, "code exchange failed", http.StatusBadGateway)
		return
	}
	client := h.oauthConfig().Client(ctx, token)

	var ghUser struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := githubGet(ctx, client, "/user", &ghUser); err != nil {
		h.log.Warn("github callback: /user failed", "provider", h.info.Name, "err", err)
		http.Error(w, "cannot read GitHub profile", http.StatusBadGateway)
		return
	}
	if ghUser.ID == 0 {
		http.Error(w, "GitHub profile has no id", http.StatusBadGateway)
		return
	}

	email, err := h.primaryVerifiedEmail(ctx, client)
	if err != nil {
		h.log.Warn("github callback: /user/emails failed", "provider", h.info.Name, "err", err)
		http.Error(w, "cannot read GitHub email addresses", http.StatusBadGateway)
		return
	}
	if email == "" {
		http.Error(w, "GitHub account has no verified primary email", http.StatusForbidden)
		return
	}

	displayName := ghUser.Name
	if displayName == "" {
		displayName = ghUser.Login
	}
	var namePtr *string
	if displayName != "" {
		namePtr = &displayName
	}
	h.finish.finish(w, r, h.info.IdentityKey(), strconv.FormatInt(ghUser.ID, 10), email, namePtr)
}

// primaryVerifiedEmail returns the account's primary verified email, or any
// verified one when no primary is flagged.
func (h *GitHubHandler) primaryVerifiedEmail(ctx context.Context, client *http.Client) (string, error) {
	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := githubGet(ctx, client, "/user/emails", &emails); err != nil {
		return "", err
	}
	fallback := ""
	for _, e := range emails {
		if !e.Verified {
			continue
		}
		if e.Primary {
			return e.Email, nil
		}
		if fallback == "" {
			fallback = e.Email
		}
	}
	return fallback, nil
}

func githubGet(ctx context.Context, client *http.Client, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubAPIBase+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close() //nolint:errcheck
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("GET %s: HTTP %d: %s", path, resp.StatusCode, body)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
