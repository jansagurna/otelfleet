package api

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/sag-solutions/otelfleet/internal/api/apigen"
	"github.com/sag-solutions/otelfleet/internal/audit"
	"github.com/sag-solutions/otelfleet/internal/store"
	"github.com/sag-solutions/otelfleet/internal/tenants"
)

// --- mapping helpers ---

func hexPtr(b []byte) *string {
	if len(b) == 0 {
		return nil
	}
	s := hex.EncodeToString(b)
	return &s
}

// configInSync is true/false when both hashes are known, nil otherwise.
func configInSync(assigned, reported []byte) *bool {
	if len(assigned) == 0 || len(reported) == 0 {
		return nil
	}
	v := bytes.Equal(assigned, reported)
	return &v
}

func toAgent(a store.Agent) apigen.Agent {
	return apigen.Agent{
		Id:                 a.ID,
		InstanceUid:        hex.EncodeToString(a.InstanceUID),
		Class:              apigen.AgentClass(a.Class),
		CustomerId:         a.CustomerID,
		CustomerName:       a.CustomerName,
		Name:               a.Name,
		AgentVersion:       a.AgentVersion,
		Connected:          a.Connected,
		Healthy:            a.Healthy,
		LastSeenAt:         a.LastSeenAt,
		RemoteConfigStatus: apigen.RemoteConfigStatus(a.RemoteConfigStatus),
		RemoteConfigError:  a.RemoteConfigError,
		AssignedConfigHash: hexPtr(a.AssignedConfigHash),
		ReportedConfigHash: hexPtr(a.ReportedConfigHash),
		ConfigInSync:       configInSync(a.AssignedConfigHash, a.ReportedConfigHash),
		CreatedAt:          a.CreatedAt,
	}
}

func toAgentDetail(a store.Agent) (apigen.AgentDetail, error) {
	base := toAgent(a)
	detail := apigen.AgentDetail{
		Id:                 base.Id,
		InstanceUid:        base.InstanceUid,
		Class:              base.Class,
		CustomerId:         base.CustomerId,
		CustomerName:       base.CustomerName,
		Name:               base.Name,
		AgentVersion:       base.AgentVersion,
		Connected:          base.Connected,
		Healthy:            base.Healthy,
		LastSeenAt:         base.LastSeenAt,
		RemoteConfigStatus: base.RemoteConfigStatus,
		RemoteConfigError:  base.RemoteConfigError,
		AssignedConfigHash: base.AssignedConfigHash,
		ReportedConfigHash: base.ReportedConfigHash,
		ConfigInSync:       base.ConfigInSync,
		CreatedAt:          base.CreatedAt,
	}
	if len(a.Description) > 0 {
		var m map[string]any
		if err := json.Unmarshal(a.Description, &m); err != nil {
			return apigen.AgentDetail{}, err
		}
		detail.Description = &m
	}
	if len(a.Health) > 0 {
		var m map[string]any
		if err := json.Unmarshal(a.Health, &m); err != nil {
			return apigen.AgentDetail{}, err
		}
		detail.Health = &m
	}
	return detail, nil
}

func toBootstrapToken(t store.BootstrapToken) apigen.BootstrapToken {
	return apigen.BootstrapToken{
		Id:          t.ID,
		CustomerId:  t.CustomerID,
		Name:        t.Name,
		TokenPrefix: t.TokenPrefix,
		MaxUses:     t.MaxUses,
		UsedCount:   t.UsedCount,
		CreatedAt:   t.CreatedAt,
		ExpiresAt:   t.ExpiresAt,
		RevokedAt:   t.RevokedAt,
	}
}

// --- agents ---

func (s *Server) ListAgents(ctx context.Context, request apigen.ListAgentsRequestObject) (apigen.ListAgentsResponseObject, error) {
	f := store.AgentFilter{
		CustomerID: request.Params.CustomerId,
		Connected:  request.Params.Connected,
	}
	if request.Params.Class != nil {
		v := string(*request.Params.Class)
		f.Class = &v
	}
	agents, err := s.store.ListAgents(ctx, f)
	if err != nil {
		return nil, err
	}
	out := make([]apigen.Agent, 0, len(agents))
	for _, a := range agents {
		out = append(out, toAgent(a))
	}
	return apigen.ListAgents200JSONResponse{Agents: out}, nil
}

func (s *Server) GetAgent(ctx context.Context, request apigen.GetAgentRequestObject) (apigen.GetAgentResponseObject, error) {
	a, err := s.store.GetAgent(ctx, request.AgentId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.GetAgent404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "agent not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	detail, err := toAgentDetail(a)
	if err != nil {
		return nil, err
	}
	return apigen.GetAgent200JSONResponse(detail), nil
}

func (s *Server) DeleteAgent(ctx context.Context, request apigen.DeleteAgentRequestObject) (apigen.DeleteAgentResponseObject, error) {
	a, err := s.store.GetAgent(ctx, request.AgentId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.DeleteAgent404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "agent not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	if s.agents != nil && s.agents.IsConnected(a.InstanceUID) {
		return apigen.DeleteAgent409JSONResponse{ConflictJSONResponse: apigen.ConflictJSONResponse{Code: codeConflict, Message: "agent is currently connected"}}, nil
	}
	err = s.store.DeleteAgent(ctx, request.AgentId, []audit.Entry{{
		ActorUserID: actorID(ctx),
		Action:      "agent.delete",
		EntityType:  "agent",
		EntityID:    request.AgentId.String(),
		CustomerID:  a.CustomerID,
		Payload:     map[string]any{"instance_uid": hex.EncodeToString(a.InstanceUID)},
	}})
	if errors.Is(err, store.ErrNotFound) {
		return apigen.DeleteAgent404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "agent not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.DeleteAgent204Response{}, nil
}

func (s *Server) GetAgentConfig(ctx context.Context, request apigen.GetAgentConfigRequestObject) (apigen.GetAgentConfigResponseObject, error) {
	a, err := s.store.GetAgent(ctx, request.AgentId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.GetAgentConfig404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "agent not found"}}, nil
	}
	if err != nil {
		return nil, err
	}

	// Assigned = the current desired config, re-rendered from database state.
	// Gateway replicas are managed outside OpAMP: "".
	assigned := ""
	if a.Class == store.AgentClassEdge && a.CustomerID != nil {
		assigned, err = s.pipelines.RenderEdgeCurrent(ctx, *a.CustomerID)
		if err != nil {
			return nil, err
		}
	}
	reported := ""
	if a.ReportedConfigYAML != nil {
		reported = *a.ReportedConfigYAML
	}
	return apigen.GetAgentConfig200JSONResponse{AssignedYaml: assigned, ReportedYaml: reported}, nil
}

func (s *Server) ListAgentEvents(ctx context.Context, request apigen.ListAgentEventsRequestObject) (apigen.ListAgentEventsResponseObject, error) {
	limit := 50
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 500 {
		limit = 500
	}
	events, err := s.store.ListAgentEvents(ctx, request.AgentId, limit)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.ListAgentEvents404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "agent not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]apigen.AgentEvent, 0, len(events))
	for _, e := range events {
		ev := apigen.AgentEvent{
			Id:        e.ID,
			EventType: apigen.AgentEventEventType(e.EventType),
			CreatedAt: e.CreatedAt,
		}
		if len(e.Detail) > 0 {
			var m map[string]any
			if err := json.Unmarshal(e.Detail, &m); err != nil {
				return nil, err
			}
			ev.Detail = &m
		}
		out = append(out, ev)
	}
	return apigen.ListAgentEvents200JSONResponse{Events: out}, nil
}

// --- bootstrap tokens ---

func (s *Server) ListBootstrapTokens(ctx context.Context, request apigen.ListBootstrapTokensRequestObject) (apigen.ListBootstrapTokensResponseObject, error) {
	toks, err := s.store.ListBootstrapTokens(ctx, request.CustomerId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.ListBootstrapTokens404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]apigen.BootstrapToken, 0, len(toks))
	for _, t := range toks {
		out = append(out, toBootstrapToken(t))
	}
	return apigen.ListBootstrapTokens200JSONResponse{Tokens: out}, nil
}

func (s *Server) CreateBootstrapToken(ctx context.Context, request apigen.CreateBootstrapTokenRequestObject) (apigen.CreateBootstrapTokenResponseObject, error) {
	maxUses := 0
	if request.Body.MaxUses != nil {
		maxUses = *request.Body.MaxUses
	}
	created, err := s.tenants.CreateBootstrapToken(ctx, actorID(ctx), request.CustomerId, request.Body.Name, request.Body.ExpiresAt, maxUses)
	switch {
	case errors.Is(err, tenants.ErrInvalidName):
		// The contract enumerates no 400; the router's response error handler
		// maps badRequestError to a 400 Error body.
		return nil, badRequestError{err}
	case errors.Is(err, store.ErrNotFound):
		return apigen.CreateBootstrapToken404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "customer not found"}}, nil
	case err != nil:
		return nil, err
	}
	base := toBootstrapToken(created.Token)
	return apigen.CreateBootstrapToken201JSONResponse{
		Id:          base.Id,
		CustomerId:  base.CustomerId,
		Name:        base.Name,
		TokenPrefix: base.TokenPrefix,
		MaxUses:     base.MaxUses,
		UsedCount:   base.UsedCount,
		CreatedAt:   base.CreatedAt,
		ExpiresAt:   base.ExpiresAt,
		RevokedAt:   base.RevokedAt,
		Secret:      created.Secret,
	}, nil
}

func (s *Server) RevokeBootstrapToken(ctx context.Context, request apigen.RevokeBootstrapTokenRequestObject) (apigen.RevokeBootstrapTokenResponseObject, error) {
	err := s.tenants.RevokeBootstrapToken(ctx, actorID(ctx), request.CustomerId, request.TokenId)
	if errors.Is(err, store.ErrNotFound) {
		return apigen.RevokeBootstrapToken404JSONResponse{NotFoundJSONResponse: apigen.NotFoundJSONResponse{Code: codeNotFound, Message: "bootstrap token not found"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return apigen.RevokeBootstrapToken204Response{}, nil
}
