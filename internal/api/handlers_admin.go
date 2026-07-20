package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/jansagurna/otelfleet/internal/api/apigen"
	"github.com/jansagurna/otelfleet/internal/audit"
	"github.com/jansagurna/otelfleet/internal/auth"
	"github.com/jansagurna/otelfleet/internal/authz"
	"github.com/jansagurna/otelfleet/internal/crypto"
	"github.com/jansagurna/otelfleet/internal/store"
)

// All handlers in this file sit behind the Guard middleware's admin-only path
// set: only admins ever reach them (viewer/operator get 403 upfront).

// --- users ---

func toUserAccount(u store.UserWithIdentities) apigen.UserAccount {
	identities := u.Identities
	if identities == nil {
		identities = []string{}
	}
	customerIDs := u.CustomerIDs
	if customerIDs == nil {
		customerIDs = []uuid.UUID{}
	}
	return apigen.UserAccount{
		Id:          u.ID,
		Email:       openapi_types.Email(u.Email),
		DisplayName: u.DisplayName,
		Role:        apigen.Role(u.Role),
		Disabled:    u.DisabledAt != nil,
		Invited:     len(identities) == 0,
		Identities:  identities,
		CustomerIds: &customerIDs,
		LastLoginAt: u.LastLoginAt,
		CreatedAt:   u.CreatedAt,
	}
}

func (s *Server) ListUsers(ctx context.Context, _ apigen.ListUsersRequestObject) (apigen.ListUsersResponseObject, error) {
	users, err := s.store.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]apigen.UserAccount, 0, len(users))
	for _, u := range users {
		out = append(out, toUserAccount(u))
	}
	return apigen.ListUsers200JSONResponse{Users: out}, nil
}

// InviteUser creates a user row without any identity; the identity links (by
// email) on their first SSO login and the assigned role survives it.
func (s *Server) InviteUser(ctx context.Context, request apigen.InviteUserRequestObject) (apigen.InviteUserResponseObject, error) {
	email := strings.ToLower(strings.TrimSpace(string(request.Body.Email)))
	role := string(request.Body.Role)
	if email == "" || !strings.Contains(email, "@") {
		return nil, badRequestError{errors.New("invalid email")}
	}
	if !authz.Known(role) {
		return nil, badRequestError{fmt.Errorf("unknown role %q", role)}
	}
	id := uuid.New()
	user, err := s.store.CreateInvitedUser(ctx, id, email, role, []audit.Entry{{
		ActorUserID: actorID(ctx),
		Action:      "user.invite",
		EntityType:  "user",
		EntityID:    id.String(),
		Payload:     map[string]string{"email": email, "role": role},
	}})
	if errors.Is(err, store.ErrEmailExists) {
		return apigen.InviteUser409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "a user with this email already exists"}}, nil
	}
	if err != nil {
		return nil, err
	}

	acct := store.UserWithIdentities{User: user}
	// Grants only apply to non-admins (admins always access all customers).
	if role != authz.RoleAdmin && request.Body.CustomerIds != nil && len(*request.Body.CustomerIds) > 0 {
		if err := s.setUserGrants(ctx, id, *request.Body.CustomerIds); err != nil {
			return nil, err
		}
		acct.CustomerIDs = *request.Body.CustomerIds
	}
	return apigen.InviteUser201JSONResponse(toUserAccount(acct)), nil
}

// setUserGrants replaces a user's tenant-scope grants, mapping an unknown
// customer id to a 400 rather than a 500.
func (s *Server) setUserGrants(ctx context.Context, userID uuid.UUID, customerIDs []uuid.UUID) error {
	err := s.store.SetUserCustomerGrants(ctx, userID, customerIDs, []audit.Entry{{
		ActorUserID: actorID(ctx),
		Action:      "user.grants",
		EntityType:  "user",
		EntityID:    userID.String(),
		Payload:     map[string]any{"customerCount": len(customerIDs)},
	}})
	if errors.Is(err, store.ErrNotFound) {
		return badRequestError{errors.New("unknown user or customer in customerIds")}
	}
	return err
}

func (s *Server) UpdateUser(ctx context.Context, request apigen.UpdateUserRequestObject) (apigen.UpdateUserResponseObject, error) {
	p, ok := auth.PrincipalFrom(ctx)
	if !ok { // unreachable: Guard rejects unauthenticated requests first
		return apigen.UpdateUser401JSONResponse{UnauthorizedJSONResponse: apigen.UnauthorizedJSONResponse{Code: codeUnauthorized, Message: "authentication required"}}, nil
	}

	upd := store.UserUpdate{Disabled: request.Body.Disabled}
	payload := map[string]any{}
	if request.Body.Role != nil {
		role := string(*request.Body.Role)
		if !authz.Known(role) {
			return apigen.UpdateUser400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: fmt.Sprintf("unknown role %q", role)}}, nil
		}
		upd.Role = &role
		payload["role"] = role
	}
	if request.Body.Disabled != nil {
		payload["disabled"] = *request.Body.Disabled
	}
	hasGrantUpdate := request.Body.CustomerIds != nil
	if upd.Role == nil && upd.Disabled == nil && !hasGrantUpdate {
		return apigen.UpdateUser400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "nothing to update: provide role, disabled and/or customerIds"}}, nil
	}

	// Admins never demote or disable themselves; someone else has to.
	if request.UserId == p.User.ID {
		if upd.Role != nil && *upd.Role != authz.RoleAdmin {
			return apigen.UpdateUser409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "you cannot change your own role"}}, nil
		}
		if upd.Disabled != nil && *upd.Disabled {
			return apigen.UpdateUser409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "you cannot disable yourself"}}, nil
		}
	}

	// Apply grants first so a subsequent read reflects the new scope. Empty
	// slice clears all grants (unscoped); a non-empty slice replaces them.
	if hasGrantUpdate {
		if err := s.setUserGrants(ctx, request.UserId, *request.Body.CustomerIds); err != nil {
			return nil, err
		}
	}

	// Role/disabled change: UpdateUserAdmin re-reads and returns fresh grants.
	if upd.Role != nil || upd.Disabled != nil {
		user, err := s.store.UpdateUserAdmin(ctx, request.UserId, upd, []audit.Entry{{
			ActorUserID: actorID(ctx),
			Action:      "user.update",
			EntityType:  "user",
			EntityID:    request.UserId.String(),
			Payload:     payload,
		}})
		switch {
		case errors.Is(err, store.ErrNotFound):
			return apigen.UpdateUser404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "user not found"}}, nil
		case errors.Is(err, store.ErrLastAdmin):
			return apigen.UpdateUser409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "this change would leave no enabled admin"}}, nil
		case err != nil:
			return nil, err
		}
		return apigen.UpdateUser200JSONResponse(toUserAccount(user)), nil
	}

	// Grants-only update: return the refreshed user.
	u, err := s.store.GetUserWithIdentities(ctx, request.UserId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.UpdateUser404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "user not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.UpdateUser200JSONResponse(toUserAccount(u)), nil
}

func (s *Server) DeleteUser(ctx context.Context, request apigen.DeleteUserRequestObject) (apigen.DeleteUserResponseObject, error) {
	p, ok := auth.PrincipalFrom(ctx)
	if !ok {
		return apigen.DeleteUser401JSONResponse{UnauthorizedJSONResponse: apigen.UnauthorizedJSONResponse{Code: codeUnauthorized, Message: "authentication required"}}, nil
	}
	if request.UserId == p.User.ID {
		return apigen.DeleteUser409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "you cannot delete yourself"}}, nil
	}
	victim, err := s.store.GetUser(ctx, request.UserId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.DeleteUser404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "user not found"}}, nil
	}
	if err != nil {
		return nil, err
	}

	err = s.store.DeleteUser(ctx, request.UserId, []audit.Entry{{
		ActorUserID: actorID(ctx),
		Action:      "user.delete",
		EntityType:  "user",
		EntityID:    request.UserId.String(),
		Payload:     map[string]string{"email": victim.Email},
	}})
	switch {
	case errors.Is(err, store.ErrNotFound):
		return apigen.DeleteUser404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "user not found"}}, nil
	case errors.Is(err, store.ErrLastAdmin):
		return apigen.DeleteUser409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "cannot delete the last enabled admin"}}, nil
	case err != nil:
		return nil, err
	}
	return apigen.DeleteUser204Response{}, nil
}

// --- auth provider settings ---

// providerNamePattern mirrors the contract's slug pattern.
var providerNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,30}$`)

func (s *Server) toAuthProviderConfig(p store.AuthProvider) apigen.AuthProviderConfig {
	return apigen.AuthProviderConfig{
		Id:          p.ID,
		Type:        apigen.AuthProviderType(p.Type),
		Name:        p.Name,
		DisplayName: p.DisplayName,
		ClientId:    p.ClientID,
		Issuer:      p.Issuer,
		Enabled:     p.Enabled,
		Source:      apigen.Database,
		RedirectUri: s.authReg.RedirectURI(p.Name),
		CreatedAt:   p.CreatedAt,
	}
}

func (s *Server) ListAuthProviderConfigs(ctx context.Context, _ apigen.ListAuthProviderConfigsRequestObject) (apigen.ListAuthProviderConfigsResponseObject, error) {
	dbProviders, err := s.store.ListAuthProviders(ctx, false)
	if err != nil {
		return nil, err
	}
	out := make([]apigen.AuthProviderConfig, 0, len(dbProviders)+len(s.cfg.OIDCProviders))
	for _, p := range dbProviders {
		out = append(out, s.toAuthProviderConfig(p))
	}
	for _, e := range s.cfg.OIDCProviders {
		issuer := e.Issuer
		out = append(out, apigen.AuthProviderConfig{
			// Deterministic synthetic ID; env providers are read-only here.
			Id:          uuid.NewSHA1(uuid.NameSpaceURL, []byte("otelfleet:env-auth-provider:"+e.Name)),
			Type:        apigen.Oidc,
			Name:        e.Name,
			DisplayName: e.DisplayName,
			ClientId:    e.ClientID,
			Issuer:      &issuer,
			Enabled:     true,
			Source:      apigen.Environment,
			RedirectUri: s.authReg.RedirectURI(e.Name),
			CreatedAt:   time.Time{},
		})
	}
	return apigen.ListAuthProviderConfigs200JSONResponse{Providers: out}, nil
}

// encryptClientSecret wraps the master-key requirement in a user-actionable
// message (only shown to admins).
func (s *Server) encryptClientSecret(secret string) ([]byte, error) {
	enc, err := s.cipher.Encrypt([]byte(secret))
	if errors.Is(err, crypto.ErrNotConfigured) {
		return nil, badRequestError{fmt.Errorf("%w — generate one with e.g. OTELFLEET_MASTER_KEY=%s", crypto.ErrNotConfigured, crypto.NewRandomKeyBase64())}
	}
	return enc, err
}

func (s *Server) CreateAuthProviderConfig(ctx context.Context, request apigen.CreateAuthProviderConfigRequestObject) (apigen.CreateAuthProviderConfigResponseObject, error) {
	body := request.Body
	ptype := string(body.Type)
	if !auth.KnownProviderType(ptype) {
		return apigen.CreateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: fmt.Sprintf("unknown provider type %q", ptype)}}, nil
	}
	if !providerNamePattern.MatchString(body.Name) {
		return apigen.CreateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "name must match ^[a-z0-9][a-z0-9-]{1,30}$"}}, nil
	}
	displayName := strings.TrimSpace(body.DisplayName)
	if displayName == "" || len(displayName) > 100 {
		return apigen.CreateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "displayName must be 1-100 characters"}}, nil
	}
	if body.ClientId == "" || body.ClientSecret == "" {
		return apigen.CreateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "clientId and clientSecret are required"}}, nil
	}
	var issuer *string
	if ptype == auth.TypeOIDC {
		if body.Issuer == nil || !strings.HasPrefix(*body.Issuer, "https://") {
			return apigen.CreateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "type oidc requires an https:// issuer"}}, nil
		}
		iss := strings.TrimSuffix(*body.Issuer, "/")
		issuer = &iss
	}

	secretEnc, err := s.encryptClientSecret(body.ClientSecret)
	if err != nil {
		return nil, err
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	id := uuid.New()
	created, err := s.store.CreateAuthProvider(ctx, store.NewAuthProvider{
		ID:              id,
		Type:            ptype,
		Name:            body.Name,
		DisplayName:     displayName,
		ClientID:        body.ClientId,
		ClientSecretEnc: secretEnc,
		Issuer:          issuer,
		Enabled:         enabled,
	}, []audit.Entry{{
		ActorUserID: actorID(ctx),
		Action:      "authprovider.create",
		EntityType:  "auth_provider",
		EntityID:    id.String(),
		Payload:     map[string]any{"type": ptype, "name": body.Name, "enabled": enabled},
	}})
	if errors.Is(err, store.ErrNameExists) {
		return apigen.CreateAuthProviderConfig409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "a provider with this name already exists"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.CreateAuthProviderConfig201JSONResponse(s.toAuthProviderConfig(created)), nil
}

func (s *Server) UpdateAuthProviderConfig(ctx context.Context, request apigen.UpdateAuthProviderConfigRequestObject) (apigen.UpdateAuthProviderConfigResponseObject, error) {
	body := request.Body
	upd := store.AuthProviderUpdate{ClientID: body.ClientId, Enabled: body.Enabled}
	payload := map[string]any{}
	if body.DisplayName != nil {
		dn := strings.TrimSpace(*body.DisplayName)
		if dn == "" || len(dn) > 100 {
			return apigen.UpdateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "displayName must be 1-100 characters"}}, nil
		}
		upd.DisplayName = &dn
		payload["display_name"] = dn
	}
	if body.ClientId != nil {
		if *body.ClientId == "" {
			return apigen.UpdateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "clientId must not be empty"}}, nil
		}
		payload["client_id"] = *body.ClientId
	}
	if body.Issuer != nil {
		if !strings.HasPrefix(*body.Issuer, "https://") {
			return apigen.UpdateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "issuer must be an https:// URL"}}, nil
		}
		iss := strings.TrimSuffix(*body.Issuer, "/")
		upd.Issuer = &iss
		payload["issuer"] = iss
	}
	if body.Enabled != nil {
		payload["enabled"] = *body.Enabled
	}
	if body.ClientSecret != nil {
		// Omitted = keep the stored secret; provided = re-encrypt.
		if *body.ClientSecret == "" {
			return apigen.UpdateAuthProviderConfig400JSONResponse{BadRequestJSONResponse: apigen.BadRequestJSONResponse{Code: codeBadRequest, Message: "clientSecret must not be empty (omit it to keep the stored one)"}}, nil
		}
		enc, err := s.encryptClientSecret(*body.ClientSecret)
		if err != nil {
			return nil, err
		}
		upd.ClientSecretEnc = enc
		payload["client_secret"] = "(rotated)"
	}

	updated, err := s.store.UpdateAuthProvider(ctx, request.ProviderId, upd, []audit.Entry{{
		ActorUserID: actorID(ctx),
		Action:      "authprovider.update",
		EntityType:  "auth_provider",
		EntityID:    request.ProviderId.String(),
		Payload:     payload,
	}})
	if errors.Is(err, store.ErrNotFound) {
		return apigen.UpdateAuthProviderConfig404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "provider not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.UpdateAuthProviderConfig200JSONResponse(s.toAuthProviderConfig(updated)), nil
}

func (s *Server) DeleteAuthProviderConfig(ctx context.Context, request apigen.DeleteAuthProviderConfigRequestObject) (apigen.DeleteAuthProviderConfigResponseObject, error) {
	provider, err := s.store.GetAuthProvider(ctx, request.ProviderId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.DeleteAuthProviderConfig404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "provider not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	err = s.store.DeleteAuthProvider(ctx, request.ProviderId, []audit.Entry{{
		ActorUserID: actorID(ctx),
		Action:      "authprovider.delete",
		EntityType:  "auth_provider",
		EntityID:    request.ProviderId.String(),
		Payload:     map[string]string{"type": provider.Type, "name": provider.Name},
	}})
	if errors.Is(err, store.ErrNotFound) {
		return apigen.DeleteAuthProviderConfig404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "provider not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.DeleteAuthProviderConfig204Response{}, nil
}

// TestAuthProviderConfig checks upstream connectivity (OIDC discovery /
// GitHub API reachability) without touching the stored secret.
func (s *Server) TestAuthProviderConfig(ctx context.Context, request apigen.TestAuthProviderConfigRequestObject) (apigen.TestAuthProviderConfigResponseObject, error) {
	p, err := s.store.GetAuthProvider(ctx, request.ProviderId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.TestAuthProviderConfig404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "provider not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	issuer := ""
	if p.Issuer != nil {
		issuer = *p.Issuer
	}
	ok, message := auth.TestProviderConnectivity(ctx, auth.ProviderInfo{
		Type:   p.Type,
		Name:   p.Name,
		Issuer: auth.EffectiveIssuer(p.Type, issuer),
	})
	return apigen.TestAuthProviderConfig200JSONResponse{Ok: ok, Message: message}, nil
}

// --- audit log ---

func (s *Server) ListAuditLog(ctx context.Context, request apigen.ListAuditLogRequestObject) (apigen.ListAuditLogResponseObject, error) {
	limit := 50
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}
	filter := store.AuditFilter{
		Action:      request.Params.Action,
		EntityType:  request.Params.EntityType,
		CustomerID:  request.Params.CustomerId,
		ActorUserID: request.Params.ActorUserId,
		From:        request.Params.From,
		To:          request.Params.To,
		Limit:       limit,
		BeforeID:    request.Params.BeforeId,
	}
	rows, err := s.store.ListAuditLog(ctx, filter)
	if err != nil {
		return nil, err
	}

	resp := apigen.ListAuditLog200JSONResponse{Entries: make([]apigen.AuditEntry, 0, len(rows))}
	for _, r := range rows {
		entry := apigen.AuditEntry{
			Id:           r.ID,
			ActorType:    apigen.AuditEntryActorType(r.ActorType),
			ActorUserId:  r.ActorUserID,
			ActorEmail:   r.ActorEmail,
			Action:       r.Action,
			EntityType:   r.EntityType,
			EntityId:     r.EntityID,
			CustomerId:   r.CustomerID,
			CustomerName: r.CustomerName,
			CreatedAt:    r.CreatedAt,
		}
		if len(r.Payload) > 0 {
			var payload map[string]any
			if err := json.Unmarshal(r.Payload, &payload); err == nil {
				entry.Payload = &payload
			}
		}
		resp.Entries = append(resp.Entries, entry)
	}
	if len(rows) == limit {
		last := rows[len(rows)-1].ID
		resp.NextBeforeId = &last
	}
	return resp, nil
}
