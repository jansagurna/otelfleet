package pipelines

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// RenderPipeline is one active customer pipeline as the renderer sees it.
type RenderPipeline struct {
	CustomerSlug string
	ClientID     string
	PipelineSlug string
	Graph        Graph
}

// routingConnectorID is the routing connector instance for one signal.
//
// NOTE: the architecture called for a single `routing/tenants` connector, but
// the routing connector (contrib v0.156) requires every pipeline listed in
// its table to be a consumer of *each* signal instance, so a shared instance
// cannot reference logs and traces pipelines at once. One connector instance
// per signal keeps the exact same routing semantics.
func routingConnectorID(signal string) string { return "routing/tenants_" + signal }

// RenderForwardingConfig renders the complete forwarding-tier collector
// config from all active pipelines. Output is deterministic: pipelines are
// sorted by (customer, pipeline) slug, map keys have a fixed or sorted order.
//
// Shape: an otlp gRPC receiver (data arrives pre-stamped with the tenant.id
// resource attribute from the ingest tier) feeds per-signal entry pipelines
// (memory_limiter + batch — safe before routing because tenant.id is a
// resource attribute), which route via per-signal routing connectors into one
// collector pipeline per (customer pipeline x signal). Signals without any
// active customer pipeline export to `debug` so the config always validates
// (the distro ships no nop components); with no pipelines at all this
// collapses to the minimal boot config.
func RenderForwardingConfig(pipelines []RenderPipeline) (string, error) {
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
			return "", fmt.Errorf("duplicate pipeline key %q in rendered config", key)
		}
		seen[key] = true
	}

	// signalsWith lists, per signal, the customer pipelines carrying it.
	signalsWith := map[string][]RenderPipeline{}
	for _, p := range ps {
		for _, sig := range p.Graph.Signals {
			signalsWith[sig] = append(signalsWith[sig], p)
		}
	}

	root := newMapNode()

	// receivers (shape mirrors collector/testdata/forwarding-sample.yaml, the
	// living contract between renderer and distro)
	receivers := newMapNode()
	receivers.set("otlp", mustNode(map[string]any{
		"protocols": map[string]any{
			"grpc": map[string]any{"endpoint": "0.0.0.0:4317"},
			"http": map[string]any{"endpoint": "0.0.0.0:4318"},
		},
	}))
	root.set("receivers", receivers.node)

	// processors: entry-pipeline defaults plus every namespaced pipeline processor.
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

	// connectors: one routing connector per signal that has pipelines.
	anyRouting := false
	connectors := newMapNode()
	for _, sig := range Signals {
		routed := signalsWith[sig]
		if len(routed) == 0 {
			continue
		}
		anyRouting = true
		// One table entry per customer, listing that customer's pipelines for
		// this signal. Tenants without pipelines fall through to
		// default_pipelines: [] and are dropped.
		table := &yaml.Node{Kind: yaml.SequenceNode}
		byClient := map[string][]string{}
		clientOrder := []string{}
		for _, p := range routed {
			if _, ok := byClient[p.ClientID]; !ok {
				clientOrder = append(clientOrder, p.ClientID)
			}
			byClient[p.ClientID] = append(byClient[p.ClientID], CollectorPipelineID(sig, p.CustomerSlug, p.PipelineSlug))
		}
		for _, clientID := range clientOrder {
			entry := newMapNode()
			entry.set("condition", mustNode(fmt.Sprintf(`resource.attributes["tenant.id"] == %q`, clientID)))
			entry.set("pipelines", mustNode(byClient[clientID]))
			table.Content = append(table.Content, entry.node)
		}
		conn := newMapNode()
		conn.set("default_pipelines", mustNode([]string{}))
		conn.set("error_mode", mustNode("ignore"))
		conn.set("table", table)
		connectors.set(routingConnectorID(sig), conn.node)
	}
	if anyRouting {
		root.set("connectors", connectors.node)
	}

	// exporters: namespaced pipeline exporters; debug for unrouted signals.
	exporters := newMapNode()
	needDebug := false
	for _, sig := range Signals {
		if len(signalsWith[sig]) == 0 {
			needDebug = true
		}
	}
	if needDebug {
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
	// Entry pipelines in canonical signal order.
	for _, sig := range Signals {
		entry := newMapNode()
		entry.set("receivers", mustNode([]string{"otlp"}))
		entry.set("processors", mustNode([]string{"memory_limiter", "batch"}))
		sink := "debug"
		if len(signalsWith[sig]) > 0 {
			sink = routingConnectorID(sig)
		}
		entry.set("exporters", mustNode([]string{sink}))
		svcPipelines.set(sig+"/in", entry.node)
	}
	// Customer pipelines, sorted, per signal in canonical order.
	for _, p := range ps {
		for _, sig := range Signals {
			if !p.Graph.hasSignal(sig) {
				continue
			}
			cp := newMapNode()
			cp.set("receivers", mustNode([]string{routingConnectorID(sig)}))
			if len(p.Graph.Processors) > 0 {
				procIDs := make([]string, 0, len(p.Graph.Processors))
				for i, n := range p.Graph.Processors {
					procIDs = append(procIDs, ComponentID(n, i, p.CustomerSlug, p.PipelineSlug))
				}
				cp.set("processors", mustNode(procIDs))
			}
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

// RenderFragment renders the per-pipeline config fragment stored with each
// version: only this pipeline's namespaced processors, exporters and
// service.pipelines entries. It is what the version endpoint returns and what
// config_hash covers.
func RenderFragment(p RenderPipeline) (string, error) {
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
		cp.set("receivers", mustNode([]string{routingConnectorID(sig)}))
		if len(p.Graph.Processors) > 0 {
			procIDs := make([]string, 0, len(p.Graph.Processors))
			for i, n := range p.Graph.Processors {
				procIDs = append(procIDs, ComponentID(n, i, p.CustomerSlug, p.PipelineSlug))
			}
			cp.set("processors", mustNode(procIDs))
		}
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

func (g Graph) hasSignal(sig string) bool {
	for _, s := range g.Signals {
		if s == sig {
			return true
		}
	}
	return false
}

// --- deterministic yaml.Node helpers ---

// mapNode builds a YAML mapping with insertion-ordered keys.
type mapNode struct{ node *yaml.Node }

func newMapNode() mapNode {
	return mapNode{node: &yaml.Node{Kind: yaml.MappingNode}}
}

func (m mapNode) set(key string, value *yaml.Node) {
	k := &yaml.Node{Kind: yaml.ScalarNode, Value: key}
	m.node.Content = append(m.node.Content, k, value)
}

// mustNode converts a Go value into a yaml.Node tree with deterministic
// (sorted) map keys. Panics on unencodable values — renderer inputs are
// JSON-decoded graphs, which always encode.
func mustNode(v any) *yaml.Node {
	n, err := toNode(v)
	if err != nil {
		panic(fmt.Sprintf("render: encode %T: %v", v, err))
	}
	return n
}

func toNode(v any) (*yaml.Node, error) {
	switch t := v.(type) {
	case nil:
		return scalarNode(nil)
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		m := newMapNode()
		for _, k := range keys {
			child, err := toNode(t[k])
			if err != nil {
				return nil, err
			}
			m.set(k, child)
		}
		return m.node, nil
	case []any:
		seq := &yaml.Node{Kind: yaml.SequenceNode}
		for _, item := range t {
			child, err := toNode(item)
			if err != nil {
				return nil, err
			}
			seq.Content = append(seq.Content, child)
		}
		return seq, nil
	case []string:
		seq := &yaml.Node{Kind: yaml.SequenceNode, Style: yaml.FlowStyle}
		for _, item := range t {
			child, err := scalarNode(item)
			if err != nil {
				return nil, err
			}
			seq.Content = append(seq.Content, child)
		}
		return seq, nil
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return scalarNode(i)
		}
		if f, err := t.Float64(); err == nil {
			return scalarNode(f)
		}
		return scalarNode(t.String())
	default:
		return scalarNode(v)
	}
}

func scalarNode(v any) (*yaml.Node, error) {
	n := &yaml.Node{}
	if err := n.Encode(v); err != nil {
		return nil, err
	}
	return n, nil
}

func marshalYAML(n *yaml.Node) (string, error) {
	var sb strings.Builder
	enc := yaml.NewEncoder(&sb)
	enc.SetIndent(2)
	if err := enc.Encode(n); err != nil {
		return "", fmt.Errorf("render: marshal yaml: %w", err)
	}
	if err := enc.Close(); err != nil {
		return "", fmt.Errorf("render: close encoder: %w", err)
	}
	return sb.String(), nil
}
