package pipelines

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"

	"github.com/sag-solutions/otelfleet/internal/audit"
	"github.com/sag-solutions/otelfleet/internal/store"
)

// Service errors surfaced to the API layer.
var (
	ErrInvalidName = errors.New("invalid pipeline name")
	// ErrSlugTaken means another pipeline of the same customer derives the same
	// slug (component IDs would collide in the rendered config).
	ErrSlugTaken = errors.New("a pipeline with an equivalent name already exists")
)

// Service orchestrates pipeline management: validation, versioning,
// activation/rollback and distribution of the rendered forwarding config.
type Service struct {
	store     store.Store
	validator *Validator
	dist      Distributor
	log       *slog.Logger
}

// NewService wires the pipeline service.
func NewService(st store.Store, v *Validator, dist Distributor, log *slog.Logger) *Service {
	return &Service{store: st, validator: v, dist: dist, log: log}
}

// toRender converts a stored active pipeline into a renderer input.
func toRender(ap store.ActivePipeline) (RenderPipeline, error) {
	g, err := ParseGraph(ap.Graph)
	if err != nil {
		return RenderPipeline{}, fmt.Errorf("pipeline %s: %w", ap.PipelineID, err)
	}
	return RenderPipeline{
		CustomerSlug: ap.CustomerSlug,
		ClientID:     ap.ClientID,
		PipelineSlug: PipelineSlug(ap.PipelineName),
		Graph:        g,
	}, nil
}

// activeRenderPipelines lists the renderer inputs, optionally excluding one
// pipeline (used when validating a candidate that replaces its active version).
func (s *Service) activeRenderPipelines(ctx context.Context, exclude *uuid.UUID) ([]RenderPipeline, error) {
	aps, err := s.store.ListActivePipelines(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]RenderPipeline, 0, len(aps))
	for _, ap := range aps {
		if exclude != nil && ap.PipelineID == *exclude {
			continue
		}
		rp, err := toRender(ap)
		if err != nil {
			return nil, err
		}
		out = append(out, rp)
	}
	return out, nil
}

// RenderCurrent renders the full forwarding config from database state. It is
// what the ops endpoint serves and what activation distributes.
func (s *Service) RenderCurrent(ctx context.Context) (string, error) {
	inputs, err := s.activeRenderPipelines(ctx, nil)
	if err != nil {
		return "", err
	}
	return RenderForwardingConfig(inputs)
}

// ValidateDraft validates a graph without a persisted pipeline context (the
// editor's live preview). The candidate renders under a placeholder identity
// alongside all currently active pipelines.
func (s *Service) ValidateDraft(ctx context.Context, g Graph) Result {
	candidate := RenderPipeline{
		CustomerSlug: "draft-validation",
		ClientID:     "cust_draft_validation",
		PipelineSlug: "draft",
		Graph:        g,
	}
	others, err := s.activeRenderPipelines(ctx, nil)
	if err != nil {
		// Still give the editor structural feedback when the store is unhappy.
		s.log.Warn("validate draft: cannot load active pipelines", "err", err)
		others = nil
	}
	return s.validator.Validate(ctx, candidate, others)
}

// Created bundles the results of creating a pipeline.
type Created struct {
	Pipeline store.Pipeline
	Version  store.PipelineVersion
}

// prepare validates the name and graph for a customer and builds the version
// insert payload. Returns a non-nil Result when the graph is invalid.
func (s *Service) prepare(ctx context.Context, cust store.Customer, name string, excludePipeline *uuid.UUID, g Graph, actor *uuid.UUID) (store.NewPipelineVersion, *Result, error) {
	slug := PipelineSlug(name)
	candidate := RenderPipeline{
		CustomerSlug: cust.Slug,
		ClientID:     cust.ClientID,
		PipelineSlug: slug,
		Graph:        g,
	}
	others, err := s.activeRenderPipelines(ctx, excludePipeline)
	if err != nil {
		return store.NewPipelineVersion{}, nil, err
	}
	res := s.validator.Validate(ctx, candidate, others)
	if !res.Valid {
		return store.NewPipelineVersion{}, &res, nil
	}

	graphJSON, err := MarshalGraph(g)
	if err != nil {
		return store.NewPipelineVersion{}, nil, err
	}
	fragment := ""
	if res.RenderedYAML != nil {
		fragment = *res.RenderedYAML
	}
	sum := sha256.Sum256([]byte(fragment))
	var output *string
	if len(res.Issues) > 0 { // validation warnings (e.g. binary unavailable)
		msgs := make([]string, 0, len(res.Issues))
		for _, iss := range res.Issues {
			msgs = append(msgs, iss.Message)
		}
		joined := strings.Join(msgs, "\n")
		output = &joined
	}
	return store.NewPipelineVersion{
		ID:               uuid.New(),
		Graph:            graphJSON,
		RenderedYAML:     fragment,
		ConfigHash:       sum[:],
		ValidationStatus: store.ValidationValid,
		ValidationOutput: output,
		CreatedBy:        actor,
	}, &res, nil
}

// Create validates and creates a pipeline with version 1 (not yet active).
// A ValidationResult with Valid=false is returned instead of persisting when
// the graph is invalid.
func (s *Service) Create(ctx context.Context, actor *uuid.UUID, customerID uuid.UUID, name string, g Graph) (Created, *Result, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 200 || PipelineSlug(name) == "" {
		return Created{}, nil, ErrInvalidName
	}
	cust, err := s.store.GetCustomer(ctx, customerID)
	if err != nil {
		return Created{}, nil, err
	}
	if cust.Status == store.CustomerDeleted {
		return Created{}, nil, store.ErrNotFound
	}

	// Distinct names can derive the same slug; component IDs would collide.
	slug := PipelineSlug(name)
	existing, err := s.store.ListPipelines(ctx, &customerID)
	if err != nil {
		return Created{}, nil, err
	}
	for _, p := range existing {
		if PipelineSlug(p.Name) == slug {
			if p.Name == name {
				return Created{}, nil, store.ErrNameExists
			}
			return Created{}, nil, ErrSlugTaken
		}
	}

	nv, res, err := s.prepare(ctx, cust, name, nil, g, actor)
	if err != nil {
		return Created{}, nil, err
	}
	if !res.Valid {
		return Created{}, res, nil
	}

	pipelineID := uuid.New()
	nv.PipelineID = pipelineID
	pipe, ver, err := s.store.CreatePipeline(ctx,
		store.NewPipeline{ID: pipelineID, CustomerID: customerID, Name: name}, nv,
		[]audit.Entry{
			{ActorUserID: actor, Action: "pipeline.create", EntityType: "pipeline", EntityID: pipelineID.String(), CustomerID: &customerID,
				Payload: map[string]any{"name": name, "slug": slug}},
			{ActorUserID: actor, Action: "pipeline_version.create", EntityType: "pipeline_version", EntityID: nv.ID.String(), CustomerID: &customerID,
				Payload: map[string]any{"pipeline": pipelineID.String(), "version": 1}},
		})
	if err != nil {
		return Created{}, nil, err
	}
	return Created{Pipeline: pipe, Version: ver}, res, nil
}

// CreateVersion validates a graph and appends it as the next version of an
// existing pipeline. Invalid graphs are rejected (Result returned, nothing
// persisted).
func (s *Service) CreateVersion(ctx context.Context, actor *uuid.UUID, pipelineID uuid.UUID, g Graph) (store.PipelineVersion, *Result, error) {
	pipe, err := s.store.GetPipeline(ctx, pipelineID)
	if err != nil {
		return store.PipelineVersion{}, nil, err
	}
	cust := store.Customer{Slug: pipe.CustomerSlug, ClientID: pipe.ClientID, Status: store.CustomerActive}
	nv, res, err := s.prepare(ctx, cust, pipe.Name, &pipelineID, g, actor)
	if err != nil {
		return store.PipelineVersion{}, nil, err
	}
	if !res.Valid {
		return store.PipelineVersion{}, res, nil
	}
	nv.PipelineID = pipelineID
	ver, err := s.store.CreatePipelineVersion(ctx, nv, []audit.Entry{
		{ActorUserID: actor, Action: "pipeline_version.create", EntityType: "pipeline_version", EntityID: nv.ID.String(), CustomerID: &pipe.CustomerID,
			Payload: map[string]any{"pipeline": pipelineID.String()}},
	})
	if err != nil {
		return store.PipelineVersion{}, nil, err
	}
	return ver, res, nil
}

// Activate points the pipeline at the given version (also the rollback path)
// and distributes the newly rendered forwarding config.
func (s *Service) Activate(ctx context.Context, actor *uuid.UUID, pipelineID uuid.UUID, version int) (store.Pipeline, string, string, error) {
	pipe, ver, err := s.store.ActivatePipelineVersion(ctx, pipelineID, version, []audit.Entry{
		{ActorUserID: actor, Action: "pipeline_version.activate", EntityType: "pipeline", EntityID: pipelineID.String(),
			Payload: map[string]any{"version": version}},
	})
	if err != nil {
		return store.Pipeline{}, "", "", err
	}
	_ = ver
	state, detail, err := s.distribute(ctx)
	if err != nil {
		// The version IS active in the database; the config endpoint always
		// re-renders, so a failed push is a delivery problem, not state loss.
		return store.Pipeline{}, "", "", fmt.Errorf("version %d activated, but distributing the config failed: %w", version, err)
	}
	return pipe, state, detail, nil
}

// Delete removes a pipeline and redistributes the config without it. A failed
// redistribution is logged, not fatal — the deletion has already happened and
// the config endpoint re-renders from database state.
func (s *Service) Delete(ctx context.Context, actor *uuid.UUID, pipelineID uuid.UUID) error {
	pipe, err := s.store.GetPipeline(ctx, pipelineID)
	if err != nil {
		return err
	}
	wasActive := pipe.ActiveVersionID != nil
	if err := s.store.DeletePipeline(ctx, pipelineID, []audit.Entry{
		{ActorUserID: actor, Action: "pipeline.delete", EntityType: "pipeline", EntityID: pipelineID.String(), CustomerID: &pipe.CustomerID,
			Payload: map[string]any{"name": pipe.Name}},
	}); err != nil {
		return err
	}
	if wasActive {
		if _, _, err := s.distribute(ctx); err != nil {
			s.log.Warn("pipeline deleted but config redistribution failed", "pipeline", pipelineID, "err", err)
		}
	}
	return nil
}

func (s *Service) distribute(ctx context.Context) (string, string, error) {
	full, err := s.RenderCurrent(ctx)
	if err != nil {
		return "", "", err
	}
	return s.dist.Distribute(ctx, full)
}
