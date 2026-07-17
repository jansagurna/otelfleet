import type { AuthProviderType } from '@/api/generated'

/**
 * Display metadata per provider type. Letter marks only — no trademark
 * logos in the console.
 */
export const PROVIDER_TYPES: readonly {
  value: AuthProviderType
  label: string
  mark: string
}[] = [
  { value: 'google', label: 'Google', mark: 'G' },
  { value: 'microsoft', label: 'Microsoft', mark: 'M' },
  { value: 'github', label: 'GitHub', mark: 'GH' },
  { value: 'oidc', label: 'OIDC', mark: 'ID' },
] as const

export function providerTypeLabel(type: AuthProviderType): string {
  return PROVIDER_TYPES.find((t) => t.value === type)?.label ?? type
}

export function providerTypeMark(type: AuthProviderType): string {
  return PROVIDER_TYPES.find((t) => t.value === type)?.mark ?? '?'
}

/** Square mono letter mark standing in for provider logos. */
export function ProviderMark({ type }: { type: AuthProviderType }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-line bg-surface-2 font-mono text-[9px] font-semibold text-ink-2"
    >
      {providerTypeMark(type)}
    </span>
  )
}
