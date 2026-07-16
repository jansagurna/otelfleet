package pipelines

import (
	"context"
	"sync"
)

// Rollout states (mirror the RolloutStatus.state contract enum).
const (
	StateApplied        = "applied"
	StatePendingRestart = "pending_restart"
)

// Distributor pushes a freshly rendered forwarding config towards the
// forwarding collector(s).
type Distributor interface {
	// Distribute delivers the rendered full config. state is one of
	// StateApplied / StatePendingRestart; detail is a human-readable hint.
	Distribute(ctx context.Context, renderedFullConfig string) (state string, detail string, err error)
}

// PublishDistributor is the compose/dev distributor: the config is published
// on the ops listener (GET /internal/v1/collector-config/forwarding, which
// always re-renders from database state) and the forwarding collector picks
// it up via its HTTP config provider on restart. The in-memory copy is kept
// only for observability/debugging — it is NOT the source of truth, so a
// control-plane restart loses nothing.
type PublishDistributor struct {
	mu      sync.RWMutex
	current string
}

var _ Distributor = (*PublishDistributor)(nil)

// NewPublishDistributor creates the default distributor.
func NewPublishDistributor() *PublishDistributor { return &PublishDistributor{} }

// Distribute stores the config and reports that a collector restart applies it.
func (d *PublishDistributor) Distribute(_ context.Context, renderedFullConfig string) (string, string, error) {
	d.mu.Lock()
	d.current = renderedFullConfig
	d.mu.Unlock()
	return StatePendingRestart, "restart the forwarding collector to apply (docker compose restart forwarding)", nil
}

// Current returns the last published config ("" before the first rollout).
func (d *PublishDistributor) Current() string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.current
}
