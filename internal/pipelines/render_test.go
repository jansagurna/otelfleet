package pipelines

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var update = flag.Bool("update", false, "rewrite golden files")

func strPtr(s string) *string { return &s }

func samplePipelines() []RenderPipeline {
	return []RenderPipeline{
		{
			CustomerSlug: "globex",
			ClientID:     "cust_bbbb2222",
			PipelineSlug: "audit",
			Graph: Graph{
				Signals:    []string{"logs"},
				Processors: []Node{},
				Exporters: []Node{
					{Type: "otlphttp", Name: strPtr("grafana"), Config: map[string]any{
						"endpoint": "https://otlp.example.com",
						"headers":  map[string]any{"authorization": "Bearer secret"},
					}},
					{Type: "debug", Config: map[string]any{}},
				},
			},
		},
		{
			CustomerSlug: "acme-corp",
			ClientID:     "cust_aaaa1111",
			PipelineSlug: "backup",
			Graph: Graph{
				Signals: []string{"logs", "traces"},
				Processors: []Node{
					{Type: "batch", Config: map[string]any{"send_batch_size": 512}},
				},
				Exporters: []Node{
					{Type: "otlp", Config: map[string]any{"endpoint": "acme-backend:4317", "tls": map[string]any{"insecure": true}}},
				},
			},
		},
	}
}

func checkGolden(t *testing.T, name, got string) {
	t.Helper()
	path := filepath.Join("testdata", name)
	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden %s (run with -update to create): %v", path, err)
	}
	if got != string(want) {
		t.Errorf("%s mismatch:\n--- got ---\n%s\n--- want ---\n%s", name, got, want)
	}
}

func TestRenderForwardingConfigGolden(t *testing.T) {
	got, err := RenderForwardingConfig(samplePipelines())
	if err != nil {
		t.Fatal(err)
	}
	checkGolden(t, "forwarding_two_customers.golden.yaml", got)

	// Structural invariants the golden file must encode.
	for _, want := range []string{
		"routing/tenants_logs",
		"routing/tenants_traces",
		`condition: resource.attributes["tenant.id"] == "cust_aaaa1111"`,
		"logs/acme-corp__backup",
		"traces/acme-corp__backup",
		"logs/globex__audit",
		"otlp/acme-corp__backup__0",
		"otlphttp/globex__audit__grafana",
		"batch/acme-corp__backup__0",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("rendered config missing %q", want)
		}
	}
	// No traces pipelines for globex; metrics entry pipeline must sink to debug.
	if strings.Contains(got, "traces/globex__audit") {
		t.Error("globex audit must not have a traces pipeline")
	}
	if !strings.Contains(got, "metrics/in") {
		t.Error("metrics entry pipeline missing")
	}
}

func TestRenderForwardingConfigDeterministic(t *testing.T) {
	a, err := RenderForwardingConfig(samplePipelines())
	if err != nil {
		t.Fatal(err)
	}
	// Reversed input order must yield identical output.
	ps := samplePipelines()
	ps[0], ps[1] = ps[1], ps[0]
	b, err := RenderForwardingConfig(ps)
	if err != nil {
		t.Fatal(err)
	}
	if a != b {
		t.Error("render is order-dependent")
	}
}

func TestRenderForwardingConfigEmpty(t *testing.T) {
	got, err := RenderForwardingConfig(nil)
	if err != nil {
		t.Fatal(err)
	}
	checkGolden(t, "forwarding_empty.golden.yaml", got)
	if !strings.Contains(got, "debug") {
		t.Error("empty config needs the debug sink to stay bootable")
	}
	if strings.Contains(got, "connectors") {
		t.Error("empty config must not declare connectors")
	}
}

func TestRenderDuplicateKeyRejected(t *testing.T) {
	p := samplePipelines()[1]
	if _, err := RenderForwardingConfig([]RenderPipeline{p, p}); err == nil {
		t.Fatal("duplicate pipeline keys must be rejected")
	}
}

func TestRenderFragmentStable(t *testing.T) {
	got, err := RenderFragment(samplePipelines()[1])
	if err != nil {
		t.Fatal(err)
	}
	checkGolden(t, "fragment_backup.golden.yaml", got)
}
