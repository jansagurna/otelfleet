package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jansagurna/otelfleet/internal/audit"
)

// userWithIdentitiesQuery aggregates identity provider names per user.
const userWithIdentitiesQuery = `
	SELECT u.id, u.email, u.display_name, u.role, u.disabled_at, u.last_login_at, u.created_at,
	       COALESCE(array_agg(i.provider ORDER BY i.provider) FILTER (WHERE i.provider IS NOT NULL), '{}')
	FROM users u
	LEFT JOIN user_identities i ON i.user_id = u.id`

func scanUserWithIdentities(row pgx.Row) (UserWithIdentities, error) {
	var u UserWithIdentities
	err := row.Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.DisabledAt, &u.LastLoginAt, &u.CreatedAt, &u.Identities)
	return u, err
}

// ListUsers returns all users with their linked identity provider names.
func (s *PG) ListUsers(ctx context.Context) ([]UserWithIdentities, error) {
	rows, err := s.pool.Query(ctx, userWithIdentitiesQuery+`
		GROUP BY u.id ORDER BY u.created_at, u.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserWithIdentities{}
	for rows.Next() {
		u, err := scanUserWithIdentities(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// CreateInvitedUser inserts a user without any identity; the identity is
// linked (by email) on their first SSO login. Returns ErrEmailExists when the
// email is taken.
func (s *PG) CreateInvitedUser(ctx context.Context, id uuid.UUID, email, role string, entries []audit.Entry) (User, error) {
	var u User
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		err := scanUserRow(tx.QueryRow(ctx, `
			INSERT INTO users (id, email, role) VALUES ($1, $2, $3)
			RETURNING `+userCols, id, email, role), &u)
		if isUniqueViolation(err, "users_email_key") {
			return ErrEmailExists
		}
		if err != nil {
			return fmt.Errorf("insert invited user: %w", err)
		}
		return audit.Write(ctx, tx, entries...)
	})
	if err != nil {
		return User{}, err
	}
	return u, nil
}

// UpdateUserAdmin applies a role change and/or disabled toggle. The
// last-enabled-admin invariant is enforced in the same transaction
// (ErrLastAdmin). Disabling a user also deletes their sessions.
func (s *PG) UpdateUserAdmin(ctx context.Context, id uuid.UUID, upd UserUpdate, entries []audit.Entry) (UserWithIdentities, error) {
	var out UserWithIdentities
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var u User
		err := scanUserRow(tx.QueryRow(ctx, `
			SELECT `+userCols+` FROM users WHERE id = $1 FOR UPDATE`, id), &u)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}

		if upd.Role != nil {
			if _, err := tx.Exec(ctx, `UPDATE users SET role = $2 WHERE id = $1`, id, *upd.Role); err != nil {
				return fmt.Errorf("update role: %w", err)
			}
		}
		if upd.Disabled != nil {
			if *upd.Disabled {
				if _, err := tx.Exec(ctx, `
					UPDATE users SET disabled_at = COALESCE(disabled_at, now()) WHERE id = $1`, id); err != nil {
					return fmt.Errorf("disable user: %w", err)
				}
				if err := deleteSessionsByUser(ctx, tx, id); err != nil {
					return err
				}
			} else {
				if _, err := tx.Exec(ctx, `UPDATE users SET disabled_at = NULL WHERE id = $1`, id); err != nil {
					return fmt.Errorf("enable user: %w", err)
				}
			}
		}

		if err := ensureEnabledAdminRemains(ctx, tx); err != nil {
			return err
		}
		if err := audit.Write(ctx, tx, entries...); err != nil {
			return err
		}
		out, err = scanUserWithIdentities(tx.QueryRow(ctx, userWithIdentitiesQuery+`
			WHERE u.id = $1 GROUP BY u.id`, id))
		return err
	})
	if err != nil {
		return UserWithIdentities{}, err
	}
	return out, nil
}

// DeleteUser removes a user (identities cascade; created_by references are
// nulled so history survives) and their sessions. Deleting the last enabled
// admin is rejected with ErrLastAdmin.
func (s *PG) DeleteUser(ctx context.Context, id uuid.UUID, entries []audit.Entry) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		// created_by columns reference users without ON DELETE; keep the rows,
		// drop the attribution (the audit log retains who did what).
		for _, table := range []string{"api_keys", "pipeline_versions", "bootstrap_tokens"} {
			if _, err := tx.Exec(ctx, `UPDATE `+table+` SET created_by = NULL WHERE created_by = $1`, id); err != nil {
				return fmt.Errorf("detach %s.created_by: %w", table, err)
			}
		}
		tag, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
		if err != nil {
			return fmt.Errorf("delete user: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		if err := ensureEnabledAdminRemains(ctx, tx); err != nil {
			return err
		}
		if err := deleteSessionsByUser(ctx, tx, id); err != nil {
			return err
		}
		return audit.Write(ctx, tx, entries...)
	})
}

// ensureEnabledAdminRemains fails the transaction with ErrLastAdmin when no
// enabled admin would be left after the pending changes.
func ensureEnabledAdminRemains(ctx context.Context, tx pgx.Tx) error {
	var n int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM users WHERE role = 'admin' AND disabled_at IS NULL`).Scan(&n); err != nil {
		return fmt.Errorf("count enabled admins: %w", err)
	}
	if n == 0 {
		return ErrLastAdmin
	}
	return nil
}

// deleteSessionsByUser drops the scs session rows of one user. The pgxstore
// data column is the gob-encoded session map; the user id is stored as its
// UUID string, whose 36 bytes appear verbatim in the gob stream, so a byte
// scan finds every session of the user. Belt and braces: the Guard middleware
// re-loads the user per request and rejects disabled/deleted accounts even if
// a session row survived.
func deleteSessionsByUser(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	if _, err := tx.Exec(ctx, `
		DELETE FROM sessions WHERE position($1 in data) > 0`, []byte(id.String())); err != nil {
		return fmt.Errorf("delete sessions: %w", err)
	}
	return nil
}
