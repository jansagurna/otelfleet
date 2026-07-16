// Package store is the PostgreSQL persistence layer of the control plane.
// Mutating methods take the audit entries that must be written in the same
// transaction as the mutation.
package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/sag-solutions/otelfleet/internal/audit"
)

// Sentinel errors returned by Store implementations.
var (
	ErrNotFound   = errors.New("not found")
	ErrSlugExists = errors.New("slug already exists")
	ErrNameExists = errors.New("name already exists")
	ErrConflict   = errors.New("conflict")
)

// Customer statuses.
const (
	CustomerActive    = "active"
	CustomerSuspended = "suspended"
	CustomerDeleted   = "deleted"
)

// Customer is a tenant of the platform.
type Customer struct {
	ID        uuid.UUID
	Slug      string
	Name      string
	ClientID  string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// CustomerRef is the minimal mapping used to join ClickHouse TenantId
// (= client_id) back to customers.
type CustomerRef struct {
	ID       uuid.UUID
	Name     string
	ClientID string
}

// User is a control-plane (UI) user.
type User struct {
	ID          uuid.UUID
	Email       string
	DisplayName *string
	Role        string
	DisabledAt  *time.Time
	CreatedAt   time.Time
}

// APIKey is an ingest API key. The secret is never stored, only its SHA-256.
type APIKey struct {
	ID         uuid.UUID
	CustomerID uuid.UUID
	Name       string
	KeyPrefix  string
	KeyHash    []byte
	CreatedBy  *uuid.UUID
	CreatedAt  time.Time
	ExpiresAt  *time.Time
	RevokedAt  *time.Time
	LastUsedAt *time.Time
}

// NewCustomer is the insert payload for a customer. ID must be pre-generated
// by the caller so audit entries can reference it.
type NewCustomer struct {
	ID       uuid.UUID
	Slug     string
	Name     string
	ClientID string
}

// NewAPIKey is the insert payload for an API key.
type NewAPIKey struct {
	ID         uuid.UUID
	CustomerID uuid.UUID
	Name       string
	KeyPrefix  string
	KeyHash    []byte
	CreatedBy  *uuid.UUID
	ExpiresAt  *time.Time
}

// CustomerUpdate carries the PATCH fields; nil means unchanged.
type CustomerUpdate struct {
	Name   *string
	Status *string
}

// AuthKey is what the ingest auth service needs to validate a presented key.
type AuthKey struct {
	KeyID          uuid.UUID
	CustomerID     uuid.UUID
	ClientID       string
	KeyHash        []byte
	CustomerStatus string
	ExpiresAt      *time.Time
}

// Pipeline validation statuses.
const (
	ValidationValid   = "valid"
	ValidationInvalid = "invalid"
)

// Pipeline target classes.
const (
	ClassForwarding = "forwarding"
	ClassEdge       = "edge"
)

// Agent classes.
const (
	AgentClassGateway = "gateway"
	AgentClassEdge    = "edge"
)

// Remote config statuses (agents.remote_config_status).
const (
	RemoteConfigUnset    = "unset"
	RemoteConfigApplying = "applying"
	RemoteConfigApplied  = "applied"
	RemoteConfigFailed   = "failed"
)

// Agent event types (agent_events.event_type).
const (
	AgentEventEnrolled      = "enrolled"
	AgentEventConnected     = "connected"
	AgentEventDisconnected  = "disconnected"
	AgentEventConfigApplied = "config_applied"
	AgentEventConfigFailed  = "config_failed"
	AgentEventHealthy       = "healthy"
	AgentEventUnhealthy     = "unhealthy"
)

// Pipeline is a customer pipeline on the forwarding tier, joined with the
// customer fields the API and renderer need.
type Pipeline struct {
	ID              uuid.UUID
	CustomerID      uuid.UUID
	CustomerName    string
	CustomerSlug    string
	ClientID        string
	Name            string
	TargetClass     string
	ActiveVersionID *uuid.UUID
	ActiveVersion   *int // version number of the active version, if any
	LatestVersion   *int // highest version number, nil when no versions exist
	CreatedAt       time.Time
}

// PipelineVersion is one immutable version of a pipeline graph.
type PipelineVersion struct {
	ID               uuid.UUID
	PipelineID       uuid.UUID
	Version          int
	Graph            []byte // JSONB payload (PipelineGraph)
	RenderedYAML     string
	ConfigHash       []byte // SHA-256(RenderedYAML)
	ValidationStatus string
	ValidationOutput *string
	CreatedBy        *uuid.UUID
	CreatedByEmail   *string
	CreatedAt        time.Time
	Active           bool
}

// NewPipeline is the insert payload for a pipeline. ID must be pre-generated
// by the caller so audit entries can reference it.
type NewPipeline struct {
	ID          uuid.UUID
	CustomerID  uuid.UUID
	Name        string
	TargetClass string // ClassForwarding or ClassEdge
}

// NewPipelineVersion is the insert payload for a pipeline version. The
// version number is assigned by the store (max+1 within the pipeline).
type NewPipelineVersion struct {
	ID               uuid.UUID
	PipelineID       uuid.UUID
	Graph            []byte
	RenderedYAML     string
	ConfigHash       []byte
	ValidationStatus string
	ValidationOutput *string
	CreatedBy        *uuid.UUID
}

// ActivePipeline is the renderer's view of one active pipeline version.
type ActivePipeline struct {
	PipelineID   uuid.UUID
	PipelineName string
	CustomerID   uuid.UUID
	CustomerSlug string
	ClientID     string
	Graph        []byte
}

// BootstrapToken is an edge-agent enrollment token. The secret is never
// stored, only its SHA-256.
type BootstrapToken struct {
	ID          uuid.UUID
	CustomerID  uuid.UUID
	Name        string
	TokenPrefix string
	TokenHash   []byte
	MaxUses     int // 0 = unlimited
	UsedCount   int
	CreatedBy   *uuid.UUID
	CreatedAt   time.Time
	ExpiresAt   time.Time
	RevokedAt   *time.Time
}

// NewBootstrapToken is the insert payload for a bootstrap token.
type NewBootstrapToken struct {
	ID          uuid.UUID
	CustomerID  uuid.UUID
	Name        string
	TokenPrefix string
	TokenHash   []byte
	MaxUses     int
	CreatedBy   *uuid.UUID
	ExpiresAt   time.Time
}

// EnrollToken is what the OpAMP auth path needs to validate a presented
// bootstrap token (non-revoked tokens only; expiry, use count and customer
// status are checked by the caller).
type EnrollToken struct {
	TokenID        uuid.UUID
	CustomerID     uuid.UUID
	TokenHash      []byte
	MaxUses        int
	UsedCount      int
	ExpiresAt      time.Time
	CustomerStatus string
}

// Agent is one collector instance (gateway replica or OpAMP-managed edge
// agent), joined with the customer name the API needs.
type Agent struct {
	ID                 uuid.UUID
	InstanceUID        []byte // OpAMP instance UID (16 bytes)
	CustomerID         *uuid.UUID
	CustomerName       *string
	Class              string
	Name               *string
	AgentVersion       *string
	Description        []byte // JSONB (full AgentDescription attributes)
	Capabilities       *int64
	AssignedConfigHash []byte
	ReportedConfigHash []byte
	ReportedConfigYAML *string
	RemoteConfigStatus string
	RemoteConfigError  *string
	Health             []byte // JSONB (ComponentHealth tree)
	Healthy            *bool
	Connected          bool
	LastSeenAt         *time.Time
	EnrolledVia        *uuid.UUID
	CreatedAt          time.Time
}

// NewAgent is the insert payload for a freshly enrolled edge agent.
type NewAgent struct {
	ID           uuid.UUID
	InstanceUID  []byte
	CustomerID   uuid.UUID
	Class        string
	Name         *string
	AgentVersion *string
	Description  []byte
	Capabilities int64
	EnrolledVia  uuid.UUID
}

// AgentEvent is one status transition of an agent.
type AgentEvent struct {
	ID        int64
	AgentID   uuid.UUID
	EventType string
	Detail    []byte // JSONB, may be nil
	CreatedAt time.Time
}

// AgentFilter narrows ListAgents; nil fields match everything.
type AgentFilter struct {
	Class      *string
	CustomerID *uuid.UUID
	Connected  *bool
}

// Store is the persistence interface used by services and handlers.
// It is implemented by *PG (pgx) and by fakes in tests.
type Store interface {
	// Customers
	CreateCustomer(ctx context.Context, c NewCustomer, k NewAPIKey, entries []audit.Entry) (Customer, APIKey, error)
	GetCustomer(ctx context.Context, id uuid.UUID) (Customer, error)
	ListCustomers(ctx context.Context, status *string) ([]Customer, error)
	UpdateCustomer(ctx context.Context, id uuid.UUID, upd CustomerUpdate, entries []audit.Entry) (Customer, error)
	SoftDeleteCustomer(ctx context.Context, id uuid.UUID, entries []audit.Entry) error
	CountActiveCustomers(ctx context.Context) (int, error)
	ListCustomerRefs(ctx context.Context) ([]CustomerRef, error)

	// API keys
	ListAPIKeys(ctx context.Context, customerID uuid.UUID) ([]APIKey, error)
	CreateAPIKey(ctx context.Context, k NewAPIKey, entries []audit.Entry) (APIKey, error)
	RevokeAPIKey(ctx context.Context, customerID, keyID uuid.UUID, entries []audit.Entry) error
	ActiveKeysByPrefix(ctx context.Context, prefix string) ([]AuthKey, error)
	TouchAPIKeys(ctx context.Context, usages map[uuid.UUID]time.Time) error

	// Users
	GetUser(ctx context.Context, id uuid.UUID) (User, error)
	UpsertUserByIdentity(ctx context.Context, provider, subject, email string, displayName *string, roleIfNew string) (User, error)

	// Pipelines
	CreatePipeline(ctx context.Context, p NewPipeline, v NewPipelineVersion, entries []audit.Entry) (Pipeline, PipelineVersion, error)
	GetPipeline(ctx context.Context, id uuid.UUID) (Pipeline, error)
	ListPipelines(ctx context.Context, customerID *uuid.UUID) ([]Pipeline, error)
	DeletePipeline(ctx context.Context, id uuid.UUID, entries []audit.Entry) error
	ListPipelineVersions(ctx context.Context, pipelineID uuid.UUID) ([]PipelineVersion, error)
	GetPipelineVersion(ctx context.Context, pipelineID uuid.UUID, version int) (PipelineVersion, error)
	CreatePipelineVersion(ctx context.Context, v NewPipelineVersion, entries []audit.Entry) (PipelineVersion, error)
	ActivatePipelineVersion(ctx context.Context, pipelineID uuid.UUID, version int, entries []audit.Entry) (Pipeline, PipelineVersion, error)
	// ListActivePipelines returns the renderer inputs for one target class
	// (ClassForwarding or ClassEdge), optionally narrowed to one customer.
	ListActivePipelines(ctx context.Context, targetClass string, customerID *uuid.UUID) ([]ActivePipeline, error)

	// Bootstrap tokens
	ListBootstrapTokens(ctx context.Context, customerID uuid.UUID) ([]BootstrapToken, error)
	CreateBootstrapToken(ctx context.Context, t NewBootstrapToken, entries []audit.Entry) (BootstrapToken, error)
	RevokeBootstrapToken(ctx context.Context, customerID, tokenID uuid.UUID, entries []audit.Entry) error
	ActiveBootstrapTokensByPrefix(ctx context.Context, prefix string) ([]EnrollToken, error)

	// Agents. Mutations are driven by the OpAMP module; transitions land in
	// agent_events (same transaction), user actions additionally in audit_log.
	EnrollAgent(ctx context.Context, a NewAgent) (Agent, error)
	GetAgent(ctx context.Context, id uuid.UUID) (Agent, error)
	GetAgentByInstanceUID(ctx context.Context, instanceUID []byte) (Agent, error)
	ListAgents(ctx context.Context, f AgentFilter) ([]Agent, error)
	DeleteAgent(ctx context.Context, id uuid.UUID, entries []audit.Entry) error
	UpdateAgentDescription(ctx context.Context, id uuid.UUID, name, agentVersion *string, description []byte, capabilities *int64) error
	SetAgentConnected(ctx context.Context, id uuid.UUID, connected bool, at time.Time) error
	SetAgentAssignedConfig(ctx context.Context, id uuid.UUID, hash []byte) error
	SetAgentEffectiveConfig(ctx context.Context, id uuid.UUID, yaml string, hash []byte) error
	SetAgentRemoteConfigStatus(ctx context.Context, id uuid.UUID, status string, errorMessage *string, eventType *string, detail any) error
	SetAgentHealth(ctx context.Context, id uuid.UUID, health []byte, healthy bool, flipEvent *string) error
	TouchAgents(ctx context.Context, seen map[uuid.UUID]time.Time) error
	ListAgentEvents(ctx context.Context, agentID uuid.UUID, limit int) ([]AgentEvent, error)
}
