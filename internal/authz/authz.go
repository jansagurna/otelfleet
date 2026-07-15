// Package authz implements the control plane's role model:
// admin > operator > viewer. Viewers may only read; mutations require
// operator or admin.
package authz

// Roles, ordered weakest to strongest.
const (
	RoleViewer   = "viewer"
	RoleOperator = "operator"
	RoleAdmin    = "admin"
)

var level = map[string]int{
	RoleViewer:   1,
	RoleOperator: 2,
	RoleAdmin:    3,
}

// Known reports whether role is a recognized role name.
func Known(role string) bool { return level[role] != 0 }

// AtLeast reports whether role grants at least the privileges of min.
// Unknown roles never satisfy anything.
func AtLeast(role, min string) bool {
	r, m := level[role], level[min]
	return r != 0 && m != 0 && r >= m
}

// CanMutate reports whether role may perform mutating (POST/PATCH/DELETE)
// requests.
func CanMutate(role string) bool { return AtLeast(role, RoleOperator) }
