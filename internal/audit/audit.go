// Package audit writes audit-log rows. Every mutating handler records what
// happened in the same database transaction as the mutation itself.
package audit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Actor types.
const (
	ActorUser   = "user"
	ActorSystem = "system"
	ActorAgent  = "agent"
)

// Entry is one audit-log row.
type Entry struct {
	ActorUserID *uuid.UUID
	ActorType   string // defaults to "user"
	Action      string // e.g. "customer.create", "apikey.revoke"
	EntityType  string
	EntityID    string
	CustomerID  *uuid.UUID
	Payload     any // marshalled to JSONB; may be nil
}

// Write inserts the given entries within tx.
func Write(ctx context.Context, tx pgx.Tx, entries ...Entry) error {
	for _, e := range entries {
		if e.ActorType == "" {
			e.ActorType = ActorUser
		}
		var payload []byte
		if e.Payload != nil {
			var err error
			if payload, err = json.Marshal(e.Payload); err != nil {
				return fmt.Errorf("audit: marshal payload: %w", err)
			}
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO audit_log (actor_user_id, actor_type, action, entity_type, entity_id, customer_id, payload)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			e.ActorUserID, e.ActorType, e.Action, e.EntityType, e.EntityID, e.CustomerID, payload)
		if err != nil {
			return fmt.Errorf("audit: insert: %w", err)
		}
	}
	return nil
}
