/**
 * Callback URL an IdP must allow-list for a provider slug. The server
 * computes the authoritative value (BaseURL + /auth/{name}/callback) and
 * returns it as AuthProviderConfig.redirectUri; this derivation is only
 * for the create dialog, where the provider does not exist yet.
 */
export function deriveRedirectUri(slug: string, origin: string): string {
  return `${origin}/auth/${slug}/callback`
}

/**
 * SP-side values a SAML admin registers at their IdP. The server returns the
 * authoritative values as AuthProviderConfig.acsUrl / .spEntityId; these
 * derivations are only for the create dialog, where the provider does not
 * exist yet, so they can be shown live as the slug is typed.
 */
export function deriveAcsUrl(slug: string, origin: string): string {
  return `${origin}/auth/${slug}/acs`
}

export function deriveSpEntityId(slug: string, origin: string): string {
  return `${origin}/auth/${slug}/metadata`
}
