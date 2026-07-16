package pipelines

import (
	"regexp"
	"strings"
	"testing"
)

func pathsOf(issues []Issue) []string {
	out := make([]string, 0, len(issues))
	for _, i := range issues {
		if i.Path != nil {
			out = append(out, *i.Path)
		} else {
			out = append(out, "")
		}
	}
	return out
}

func hasPath(issues []Issue, path string) bool {
	for _, p := range pathsOf(issues) {
		if p == path {
			return true
		}
	}
	return false
}

func TestValidateStructural(t *testing.T) {
	valid := Graph{
		Signals:    []string{"logs"},
		Processors: []Node{{Type: "batch", Config: map[string]any{}}},
		Exporters:  []Node{{Type: "debug", Config: map[string]any{}}},
	}
	if issues := ValidateStructural(valid); len(issues) != 0 {
		t.Fatalf("valid graph produced issues: %v", issues)
	}

	cases := []struct {
		name  string
		graph Graph
		path  string
	}{
		{"no signals", Graph{Exporters: valid.Exporters}, "signals"},
		{"bad signal", Graph{Signals: []string{"logz"}, Exporters: valid.Exporters}, "signals[0]"},
		{"duplicate signal", Graph{Signals: []string{"logs", "logs"}, Exporters: valid.Exporters}, "signals[1]"},
		{"no exporters", Graph{Signals: []string{"logs"}}, "exporters"},
		{"unknown exporter", Graph{Signals: []string{"logs"}, Exporters: []Node{{Type: "nope", Config: map[string]any{}}}}, "exporters[0].type"},
		{"unknown processor", Graph{Signals: []string{"logs"}, Processors: []Node{{Type: "nope", Config: map[string]any{}}}, Exporters: valid.Exporters}, "processors[0].type"},
		{"bad node name", Graph{Signals: []string{"logs"}, Exporters: []Node{{Type: "debug", Name: strPtr("Bad Name!"), Config: map[string]any{}}}}, "exporters[0].name"},
		{"schema violation", Graph{Signals: []string{"logs"}, Exporters: []Node{{Type: "otlphttp", Config: map[string]any{}}}}, "exporters[0].config.endpoint"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			issues := ValidateStructural(tc.graph)
			if !hasPath(issues, tc.path) {
				t.Errorf("want issue at %q, got %v", tc.path, pathsOf(issues))
			}
		})
	}
}

func TestValidateStructuralDuplicateInstance(t *testing.T) {
	g := Graph{
		Signals: []string{"logs"},
		Exporters: []Node{
			{Type: "debug", Config: map[string]any{}},
			{Type: "debug", Config: map[string]any{}},
		},
	}
	issues := ValidateStructural(g)
	found := false
	for _, i := range issues {
		if strings.Contains(i.Message, "duplicate") {
			found = true
		}
	}
	// Two unnamed debug exporters at different indices get distinct IDs
	// (index suffix), so this must be fine.
	if found {
		t.Errorf("distinct indices must not collide: %v", issues)
	}

	g.Exporters[0].Name = strPtr("x")
	g.Exporters[1].Name = strPtr("x")
	issues = ValidateStructural(g)
	found = false
	for _, i := range issues {
		if strings.Contains(i.Message, "duplicate") {
			found = true
		}
	}
	if !found {
		t.Errorf("same explicit name must collide: %v", issues)
	}
}

func TestExporterLabelRegexMatchesOwnComponents(t *testing.T) {
	re := ExporterLabelRegex("acme-corp", "backup")
	if !strings.HasPrefix(re, "^[^/]+/") || !strings.Contains(re, "acme-corp__backup__") || !strings.HasSuffix(re, ".*") {
		t.Fatalf("unexpected regex %q", re)
	}
	// PromQL fully anchors label regexes; the pattern must therefore match the
	// complete label value.
	full := regexp.MustCompile("^(?:" + re + ")$")
	if !full.MatchString("otlp/acme-corp__backup__0") {
		t.Error("regex must match a full exporter label value")
	}
	if full.MatchString("otlp/other__backup__0") {
		t.Error("regex must not match other pipelines")
	}
	id := ComponentID(Node{Type: "otlp"}, 0, "acme-corp", "backup")
	if id != "otlp/acme-corp__backup__0" {
		t.Fatalf("unexpected component id %q", id)
	}
}
