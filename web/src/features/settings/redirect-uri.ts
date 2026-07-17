/**
 * Callback URL an IdP must allow-list for a provider slug. The server
 * computes the authoritative value (BaseURL + /auth/{name}/callback) and
 * returns it as AuthProviderConfig.redirectUri; this derivation is only
 * for the create dialog, where the provider does not exist yet.
 */
export function deriveRedirectUri(slug: string, origin: string): string {
  return `${origin}/auth/${slug}/callback`
}
