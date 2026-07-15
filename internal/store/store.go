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
}
