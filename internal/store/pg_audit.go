package store

import (
	"context"
	"fmt"
)

// ListAuditLog returns audit entries newest first, joined with the actor
// email and customer name, narrowed by the filter. f.Limit must be positive
// (the API layer clamps it).
func (s *PG) ListAuditLog(ctx context.Context, f AuditFilter) ([]AuditRow, error) {
	q := `
		SELECT a.id, a.actor_user_id, u.email, a.actor_type, a.action, a.entity_type,
		       a.entity_id, a.customer_id, c.name, a.payload, a.created_at
		FROM audit_log a
		LEFT JOIN users u ON u.id = a.actor_user_id
		LEFT JOIN customers c ON c.id = a.customer_id
		WHERE true`
	args := []any{}
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	if f.Action != nil {
		q += ` AND a.action = ` + arg(*f.Action)
	}
	if f.EntityType != nil {
		q += ` AND a.entity_type = ` + arg(*f.EntityType)
	}
	if f.CustomerID != nil {
		q += ` AND a.customer_id = ` + arg(*f.CustomerID)
	}
	if f.ActorUserID != nil {
		q += ` AND a.actor_user_id = ` + arg(*f.ActorUserID)
	}
	if f.From != nil {
		q += ` AND a.created_at >= ` + arg(*f.From)
	}
	if f.To != nil {
		q += ` AND a.created_at <= ` + arg(*f.To)
	}
	if f.BeforeID != nil {
		q += ` AND a.id < ` + arg(*f.BeforeID)
	}
	q += ` ORDER BY a.id DESC LIMIT ` + arg(f.Limit)

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AuditRow{}
	for rows.Next() {
		var r AuditRow
		if err := rows.Scan(&r.ID, &r.ActorUserID, &r.ActorEmail, &r.ActorType, &r.Action,
			&r.EntityType, &r.EntityID, &r.CustomerID, &r.CustomerName, &r.Payload, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
