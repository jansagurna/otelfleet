/**
 * Derive a URL-safe slug from a customer name, mirroring the server's
 * derivation (openapi.yaml: ^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$).
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}
