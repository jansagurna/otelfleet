package pipelines

import (
	"fmt"
	"sort"
)

// Pipeline target classes (mirror the pipelines.target_class check).
const (
	ClassForwarding = "forwarding"
	ClassEdge       = "edge"
)

// RenderEdgeConfig renders the standalone collector config pushed via OpAMP
// to ONE customer's edge agents, from that customer's active edge pipelines.
// Output is deterministic: pipelines are sorted by (customer, pipeline) slug,
// map keys have a fixed or sorted order.
//
// Shape: an unauthenticated otlp receiver (gRPC 0.0.0.0:4317 + HTTP
// 0.0.0.0:4318 — the agent runs inside the customer's own network) fans out
// directly into one collector pipeline per (edge pipeline x signal):
// receivers [otlp], processors [memory_limiter, batch, ...namespaced],
// exporters [namespaced]. No entry pipelines, no connectors — listing the
// receiver in several pipelines is the collector's native fan-out. With no
// active edge pipelines this collapses to a minimal valid config
// (<signal>/in -> debug for all three signals) so idle agents stay healthy.
func RenderEdgeConfig(pipelines []RenderPipeline) (string, error) {
	ps := make([]RenderPipeline, len(pipelines))
	copy(ps, pipelines)
	sort.Slice(ps, func(i, j int) bool {
		if ps[i].CustomerSlug != ps[j].CustomerSlug {
			return ps[i].CustomerSlug < ps[j].CustomerSlug
		}
		return ps[i].PipelineSlug < ps[j].PipelineSlug
	})

	// Reject duplicate (customer, pipeline) slugs: component IDs would collide.
	seen := map[string]bool{}
	for _, p := range ps {
		key := pipelineKey(p.CustomerSlug, p.PipelineSlug)
		if seen[key] {
			return "", fmt.Errorf("duplicate pipeline key %q in rendered edge config", key)
		}
		seen[key] = true
	}

	root := newMapNode()

	// receivers
	receivers := newMapNode()
	receivers.set("otlp", mustNode(map[string]any{
		"protocols": map[string]any{
			"grpc": map[string]any{"endpoint": "0.0.0.0:4317"},
			"http": map[string]any{"endpoint": "0.0.0.0:4318"},
		},
	}))
	root.set("receivers", receivers.node)

	// processors: shared defaults plus every namespaced pipeline processor.
	processors := newMapNode()
	processors.set("memory_limiter", mustNode(map[string]any{
		"check_interval":         "1s",
		"limit_percentage":       80,
		"spike_limit_percentage": 20,
	}))
	processors.set("batch", mustNode(map[string]any{
		"send_batch_size": 8192,
		"timeout":         "5s",
	}))
	for _, p := range ps {
		for i, n := range p.Graph.Processors {
			processors.set(ComponentID(n, i, p.CustomerSlug, p.PipelineSlug), mustNode(n.Config))
		}
	}
	root.set("processors", processors.node)

	// exporters: namespaced pipeline exporters; debug only in the empty state.
	exporters := newMapNode()
	if len(ps) == 0 {
		exporters.set("debug", mustNode(map[string]any{}))
	}
	for _, p := range ps {
		for i, n := range p.Graph.Exporters {
			exporters.set(ComponentID(n, i, p.CustomerSlug, p.PipelineSlug), mustNode(n.Config))
		}
	}
	root.set("exporters", exporters.node)

	// extensions
	extensions := newMapNode()
	extensions.set("health_check", mustNode(map[string]any{"endpoint": "0.0.0.0:13133"}))
	root.set("extensions", extensions.node)

	// service
	service := newMapNode()
	service.set("extensions", mustNode([]string{"health_check"}))
	service.set("telemetry", mustNode(map[string]any{
		"logs": map[string]any{"level": "info"},
		"metrics": map[string]any{
			"readers": []any{
				map[string]any{
					"pull": map[string]any{
						"exporter": map[string]any{
							"prometheus": map[string]any{
								"host": "0.0.0.0",
								"port": 8888,
							},
						},
					},
				},
			},
		},
	}))

	svcPipelines := newMapNode()
	if len(ps) == 0 {
		// Empty state: keep the agent bootable and quietly draining.
		for _, sig := range Signals {
			entry := newMapNode()
			entry.set("receivers", mustNode([]string{"otlp"}))
			entry.set("processors", mustNode([]string{"memory_limiter", "batch"}))
			entry.set("exporters", mustNode([]string{"debug"}))
			svcPipelines.set(sig+"/in", entry.node)
		}
	}
	for _, p := range ps {
		for _, sig := range Signals {
			if !p.Graph.hasSignal(sig) {
				continue
			}
			cp := newMapNode()
			cp.set("receivers", mustNode([]string{"otlp"}))
			cp.set("processors", mustNode(edgeProcessorIDs(p)))
			expIDs := make([]string, 0, len(p.Graph.Exporters))
			for i, n := range p.Graph.Exporters {
				expIDs = append(expIDs, ComponentID(n, i, p.CustomerSlug, p.PipelineSlug))
			}
			cp.set("exporters", mustNode(expIDs))
			svcPipelines.set(CollectorPipelineID(sig, p.CustomerSlug, p.PipelineSlug), cp.node)
		}
	}
	service.set("pipelines", svcPipelines.node)
	root.set("service", service.node)

	return marshalYAML(root.node)
}

// edgeProcessorIDs is the processor chain of one edge collector pipeline:
// the shared defaults followed by the pipeline's namespaced processors.
func edgeProcessorIDs(p RenderPipeline) []string {
	ids := []string{"memory_limiter", "batch"}
	for i, n := range p.Graph.Processors {
		ids = append(ids, ComponentID(n, i, p.CustomerSlug, p.PipelineSlug))
	}
	return ids
}

// RenderEdgeFragment renders the per-pipeline config fragment stored with
// each edge pipeline version: only this pipeline's namespaced processors,
// exporters and service.pipelines entries (consuming the shared otlp
// receiver). The edge counterpart of RenderFragment.
func RenderEdgeFragment(p RenderPipeline) (string, error) {
	root := newMapNode()

	if len(p.Graph.Processors) > 0 {
		processors := newMapNode()
		for i, n := range p.Graph.Processors {
			processors.set(ComponentID(n, i, p.CustomerSlug, p.PipelineSlug), mustNode(n.Config))
		}
		root.set("processors", processors.node)
	}

	exporters := newMapNode()
	for i, n := range p.Graph.Exporters {
		exporters.set(ComponentID(n, i, p.CustomerSlug, p.PipelineSlug), mustNode(n.Config))
	}
	root.set("exporters", exporters.node)

	service := newMapNode()
	svcPipelines := newMapNode()
	for _, sig := range Signals {
		if !p.Graph.hasSignal(sig) {
			continue
		}
		cp := newMapNode()
		cp.set("receivers", mustNode([]string{"otlp"}))
		cp.set("processors", mustNode(edgeProcessorIDs(p)))
		expIDs := make([]string, 0, len(p.Graph.Exporters))
		for i, n := range p.Graph.Exporters {
			expIDs = append(expIDs, ComponentID(n, i, p.CustomerSlug, p.PipelineSlug))
		}
		cp.set("exporters", mustNode(expIDs))
		svcPipelines.set(CollectorPipelineID(sig, p.CustomerSlug, p.PipelineSlug), cp.node)
	}
	service.set("pipelines", svcPipelines.node)
	root.set("service", service.node)

	return marshalYAML(root.node)
}
