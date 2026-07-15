// Copyright The otelfleet Authors
// SPDX-License-Identifier: Apache-2.0

package tenantauth // import "github.com/sag-solutions/otelfleet/collector/extension/tenantauth"

import "go.opentelemetry.io/collector/client"

// Attribute names exposed through client.AuthData. Downstream processors
// (tenantstamp) read these to stamp resource attributes.
const (
	AttrTenantID   = "tenant.id"
	AttrClientID   = "client.id"
	AttrCustomerID = "customer.id"
)

var _ client.AuthData = (*authData)(nil)

// authData carries the identity resolved for a validated API key.
type authData struct {
	tenantID   string
	clientID   string
	customerID string
}

func (a *authData) GetAttribute(name string) any {
	switch name {
	case AttrTenantID:
		return a.tenantID
	case AttrClientID:
		return a.clientID
	case AttrCustomerID:
		return a.customerID
	default:
		return nil
	}
}

func (a *authData) GetAttributeNames() []string {
	return []string{AttrTenantID, AttrClientID, AttrCustomerID}
}
