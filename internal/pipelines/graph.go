// Package pipelines implements customer pipeline management for the
// forwarding tier: the component catalog, graph validation, rendering the
// forwarding collector config, activation/rollback and config distribution.
package pipelines

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// Signals in canonical render order.
var Signals = []string{"logs", "traces", "metrics"}

func validSignal(s string) bool {
	for _, sig := range Signals {
		if s == sig {
			return true
		}
	}
	return false
}

// Node is one processor or exporter instance in a pipeline graph.
type Node struct {
	Type   string         `json:"type"`
	Name   *string        `json:"name,omitempty"`
	Config map[string]any `json:"config"`
}

// Graph is the UI pipeline model persisted in pipeline_versions.graph. The
// receiver side is implicit: the customer's ingested stream, routed by
// tenant.id into this pipeline on the forwarding tier.
type Graph struct {
	Signals    []string `json:"signals"`
	Processors []Node   `json:"processors"`
	Exporters  []Node   `json:"exporters"`
}

// ParseGraph decodes a stored graph JSON payload. Numbers are kept as
// json.Number so integer configs render as integers.
func ParseGraph(raw []byte) (Graph, error) {
	var g Graph
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&g); err != nil {
		return Graph{}, fmt.Errorf("parse pipeline graph: %w", err)
	}
	if g.Processors == nil {
		g.Processors = []Node{}
	}
	if g.Exporters == nil {
		g.Exporters = []Node{}
	}
	return g, nil
}

// MarshalGraph encodes a graph for storage.
func MarshalGraph(g Graph) ([]byte, error) {
	if g.Processors == nil {
		g.Processors = []Node{}
	}
	if g.Exporters == nil {
		g.Exporters = []Node{}
	}
	return json.Marshal(g)
}
