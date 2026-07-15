package authz

import "testing"

func TestRBACMatrix(t *testing.T) {
	cases := []struct {
		role string
		min  string
		want bool
	}{
		{RoleAdmin, RoleAdmin, true},
		{RoleAdmin, RoleOperator, true},
		{RoleAdmin, RoleViewer, true},
		{RoleOperator, RoleAdmin, false},
		{RoleOperator, RoleOperator, true},
		{RoleOperator, RoleViewer, true},
		{RoleViewer, RoleAdmin, false},
		{RoleViewer, RoleOperator, false},
		{RoleViewer, RoleViewer, true},
		{"", RoleViewer, false},
		{"root", RoleViewer, false},
		{RoleAdmin, "root", false},
	}
	for _, c := range cases {
		if got := AtLeast(c.role, c.min); got != c.want {
			t.Errorf("AtLeast(%q, %q) = %v, want %v", c.role, c.min, got, c.want)
		}
	}
}

func TestCanMutate(t *testing.T) {
	cases := map[string]bool{
		RoleAdmin:    true,
		RoleOperator: true,
		RoleViewer:   false,
		"":           false,
		"superuser":  false,
	}
	for role, want := range cases {
		if got := CanMutate(role); got != want {
			t.Errorf("CanMutate(%q) = %v, want %v", role, got, want)
		}
	}
}

func TestKnown(t *testing.T) {
	for _, r := range []string{RoleAdmin, RoleOperator, RoleViewer} {
		if !Known(r) {
			t.Errorf("Known(%q) = false, want true", r)
		}
	}
	if Known("root") || Known("") {
		t.Error("Known accepted an unknown role")
	}
}
