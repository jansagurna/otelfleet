package auth

import (
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"encoding/xml"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	saml2 "github.com/russellhaering/gosaml2"
	dsig "github.com/russellhaering/goxmldsig"
)

// ValidateSAMLConfig checks a SAML provider config at configure time so admins
// get immediate feedback: entity id present, https SSO URL, parseable cert.
func ValidateSAMLConfig(c SAMLConfig) error {
	if strings.TrimSpace(c.IDPEntityID) == "" {
		return errors.New("idpEntityId is required")
	}
	if !strings.HasPrefix(c.IDPSSOURL, "https://") {
		return errors.New("idpSsoUrl must be an https:// URL")
	}
	if _, err := parseCertificate(c.IDPCertificate); err != nil {
		return fmt.Errorf("idpCertificate: %w", err)
	}
	return nil
}

// SAMLHandler serves SP-initiated SAML 2.0 Web Browser SSO for one resolved
// provider:
//
//   - GET  /auth/{name}/start    → redirect to the IdP with an AuthnRequest
//   - POST /auth/{name}/acs      → consume the IdP's signed assertion, log in
//   - GET  /auth/{name}/metadata → SP metadata XML for the IdP to consume
//
// Scope of this implementation: unsigned AuthnRequests and signed, unencrypted
// assertions (the default for Okta, Entra ID, Auth0, OneLogin, Google
// Workspace). The SP holds no key pair; assertion signatures are verified
// against the configured IdP certificate. It implements loginFlow (Callback is
// unused — SAML delivers via ACS) and samlFlow.
type SAMLHandler struct {
	info     ProviderInfo
	baseURL  string
	finish   loginFinisher
	log      *slog.Logger
	sp       *saml2.SAMLServiceProvider
	buildErr error
}

// NewSAMLHandler builds the SAML service provider from the resolved config.
// A bad IdP certificate is captured and surfaced at request time rather than
// panicking during resolution.
func NewSAMLHandler(info ProviderInfo, baseURL string, finisher loginFinisher) *SAMLHandler {
	h := &SAMLHandler{info: info, baseURL: baseURL, finish: finisher, log: finisher.log}
	h.sp, h.buildErr = buildServiceProvider(info, baseURL)
	return h
}

// spEntityID is the SP entity id / audience the IdP must be configured with.
func spEntityID(baseURL, name string) string { return baseURL + "/auth/" + name + "/metadata" }

// acsURL is the assertion-consumer URL the IdP posts back to.
func acsURL(baseURL, name string) string { return baseURL + "/auth/" + name + "/acs" }

func buildServiceProvider(info ProviderInfo, baseURL string) (*saml2.SAMLServiceProvider, error) {
	if info.SAML == nil {
		return nil, fmt.Errorf("saml provider %q has no config", info.Name)
	}
	cert, err := parseCertificate(info.SAML.IDPCertificate)
	if err != nil {
		return nil, fmt.Errorf("parse IdP certificate: %w", err)
	}
	return &saml2.SAMLServiceProvider{
		IdentityProviderSSOURL:      info.SAML.IDPSSOURL,
		IdentityProviderIssuer:      info.SAML.IDPEntityID,
		ServiceProviderIssuer:       spEntityID(baseURL, info.Name),
		AssertionConsumerServiceURL: acsURL(baseURL, info.Name),
		AudienceURI:                 spEntityID(baseURL, info.Name),
		SignAuthnRequests:           false,
		IDPCertificateStore: &dsig.MemoryX509CertificateStore{
			Roots: []*x509.Certificate{cert},
		},
	}, nil
}

// Start redirects the browser to the IdP's SSO endpoint with an AuthnRequest.
func (h *SAMLHandler) Start(w http.ResponseWriter, r *http.Request) {
	if h.buildErr != nil {
		h.log.Error("saml start: build sp failed", "provider", h.info.Name, "err", h.buildErr)
		http.Error(w, "identity provider misconfigured", http.StatusInternalServerError)
		return
	}
	authURL, err := h.sp.BuildAuthURL("")
	if err != nil {
		h.log.Error("saml start: build auth url failed", "provider", h.info.Name, "err", err)
		http.Error(w, "identity provider unavailable", http.StatusBadGateway)
		return
	}
	http.Redirect(w, r, authURL, http.StatusFound)
}

// Callback is unused for SAML (the IdP delivers the assertion to ACS).
func (h *SAMLHandler) Callback(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) }

// ACS consumes the IdP's SAML Response: it validates the signature against the
// IdP certificate and the assertion conditions (time window, audience), then
// finishes the login.
func (h *SAMLHandler) ACS(w http.ResponseWriter, r *http.Request) {
	if h.buildErr != nil {
		http.Error(w, "identity provider misconfigured", http.StatusInternalServerError)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	encoded := r.FormValue("SAMLResponse")
	if encoded == "" {
		http.Error(w, "missing SAMLResponse", http.StatusBadRequest)
		return
	}
	assertion, err := h.sp.RetrieveAssertionInfo(encoded)
	if err != nil {
		h.log.Warn("saml acs: assertion rejected", "provider", h.info.Name, "err", err)
		http.Error(w, "invalid SAML assertion", http.StatusForbidden)
		return
	}
	if wi := assertion.WarningInfo; wi != nil {
		if wi.InvalidTime {
			http.Error(w, "SAML assertion outside its validity window", http.StatusForbidden)
			return
		}
		if wi.NotInAudience {
			http.Error(w, "SAML assertion audience mismatch", http.StatusForbidden)
			return
		}
	}

	email := samlEmail(assertion)
	if email == "" {
		h.log.Warn("saml acs: no email in assertion", "provider", h.info.Name, "nameID", assertion.NameID)
		http.Error(w, "the SAML assertion carries no email address", http.StatusBadRequest)
		return
	}
	subject := assertion.NameID
	if subject == "" {
		subject = email
	}
	var displayName *string
	if dn := samlDisplayName(assertion); dn != "" {
		displayName = &dn
	}
	h.finish.finish(w, r, h.info.IdentityKey(), subject, strings.ToLower(email), displayName)
}

// spMetadata is a minimal SP metadata document. This SP holds no key pair
// (unsigned AuthnRequests, unencrypted assertions), so the descriptor carries
// no KeyDescriptor — just the ACS endpoint and WantAssertionsSigned, which is
// all a receive-only SP needs to advertise.
type spMetadata struct {
	XMLName  xml.Name        `xml:"urn:oasis:names:tc:SAML:2.0:metadata EntityDescriptor"`
	EntityID string          `xml:"entityID,attr"`
	SPSSO    spSSODescriptor `xml:"SPSSODescriptor"`
}

type spSSODescriptor struct {
	AuthnRequestsSigned  bool        `xml:"AuthnRequestsSigned,attr"`
	WantAssertionsSigned bool        `xml:"WantAssertionsSigned,attr"`
	Protocol             string      `xml:"protocolSupportEnumeration,attr"`
	ACS                  acsEndpoint `xml:"AssertionConsumerService"`
}

type acsEndpoint struct {
	Binding  string `xml:"Binding,attr"`
	Location string `xml:"Location,attr"`
	Index    int    `xml:"index,attr"`
}

// Metadata serves the SP metadata XML the IdP consumes to learn the SP entity
// id and ACS URL.
func (h *SAMLHandler) Metadata(w http.ResponseWriter, r *http.Request) {
	md := spMetadata{
		EntityID: spEntityID(h.baseURL, h.info.Name),
		SPSSO: spSSODescriptor{
			AuthnRequestsSigned:  false,
			WantAssertionsSigned: true,
			Protocol:             "urn:oasis:names:tc:SAML:2.0:protocol",
			ACS: acsEndpoint{
				Binding:  "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
				Location: acsURL(h.baseURL, h.info.Name),
				Index:    1,
			},
		},
	}
	out, err := xml.MarshalIndent(md, "", "  ")
	if err != nil {
		http.Error(w, "metadata unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/samlmetadata+xml")
	_, _ = w.Write([]byte(xml.Header))
	_, _ = w.Write(out)
}

// parseCertificate accepts an X.509 certificate as PEM or as bare base64 DER
// (with or without whitespace/newlines, as IdP metadata often provides).
func parseCertificate(cert string) (*x509.Certificate, error) {
	cert = strings.TrimSpace(cert)
	if cert == "" {
		return nil, fmt.Errorf("empty certificate")
	}
	if block, _ := pem.Decode([]byte(cert)); block != nil {
		return x509.ParseCertificate(block.Bytes)
	}
	// Bare base64 DER: strip any whitespace the IdP may have wrapped it in.
	clean := strings.NewReplacer(" ", "", "\n", "", "\r", "", "\t", "").Replace(cert)
	der, err := base64.StdEncoding.DecodeString(clean)
	if err != nil {
		return nil, fmt.Errorf("certificate is neither PEM nor base64 DER: %w", err)
	}
	return x509.ParseCertificate(der)
}

// emailAttributeNames are the SAML attribute names IdPs use for the email,
// checked in order (Okta/Google friendly names, then the SAML/OID URIs used by
// Entra ID and others).
var emailAttributeNames = []string{
	"email",
	"mail",
	"emailAddress",
	"User.email",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
	"urn:oid:0.9.2342.19200300.100.1.3",
}

var nameAttributeNames = []string{
	"displayName",
	"name",
	"cn",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname",
	"urn:oid:2.16.840.1.113730.3.1.241",
	"urn:oid:2.5.4.3",
}

func samlEmail(a *saml2.AssertionInfo) string {
	if strings.Contains(a.NameID, "@") {
		return a.NameID
	}
	for _, n := range emailAttributeNames {
		if v := a.Values.Get(n); v != "" {
			return v
		}
	}
	return ""
}

func samlDisplayName(a *saml2.AssertionInfo) string {
	for _, n := range nameAttributeNames {
		if v := a.Values.Get(n); v != "" {
			return v
		}
	}
	return ""
}
