package catalog

import "testing"

// Every catalog schema must compile and its defaults must satisfy it — a
// broken entry would otherwise only surface when a user opens the builder.
func TestCatalogSchemasCompileAndDefaultsValidate(t *testing.T) {
	comps := All()
	if len(comps) < 10 {
		t.Fatalf("catalog unexpectedly small: %d components", len(comps))
	}
	for _, c := range comps {
		t.Run(c.Kind+"/"+c.Type, func(t *testing.T) {
			if _, err := c.CompiledSchema(); err != nil {
				t.Fatalf("schema does not compile: %v", err)
			}
			if err := c.ValidateConfig(c.Defaults()); err != nil {
				t.Fatalf("defaults do not validate against own schema: %v", err)
			}
			if c.DisplayName == "" || c.Description == "" {
				t.Error("displayName and description are required")
			}
		})
	}
}

func TestLookup(t *testing.T) {
	if _, ok := Lookup(KindExporter, "otlphttp"); !ok {
		t.Error("otlphttp exporter missing from catalog")
	}
	if _, ok := Lookup(KindProcessor, "batch"); !ok {
		t.Error("batch processor missing from catalog")
	}
	if _, ok := Lookup(KindExporter, "batch"); ok {
		t.Error("kind mismatch must not resolve")
	}
}
