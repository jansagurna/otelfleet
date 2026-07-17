/**
 * Presentation metadata for audit entries: action verb -> chip tone, and
 * the well-known entity types the filter offers even before they appear
 * in loaded data.
 */
export type ActionTone = 'ok' | 'warn' | 'danger' | 'neutral'

/**
 * Color follows the verb: creations green, destructive verbs red,
 * mutations amber. Checked in order — "delete_pipeline_version" is danger
 * even though it mentions an entity that also appears in create actions.
 */
export function actionTone(action: string): ActionTone {
  const verb = action.toLowerCase()
  if (/delete|revoke|forget|remove|purge/.test(verb)) return 'danger'
  if (/create|invite|add|enroll|register/.test(verb)) return 'ok'
  if (/update|activate|enable|disable|suspend|rotate|change|set|test|assign/.test(verb)) {
    return 'warn'
  }
  return 'neutral'
}

export const STATIC_ENTITY_TYPES = [
  'customer',
  'api_key',
  'pipeline',
  'pipeline_version',
  'agent',
  'bootstrap_token',
  'user',
  'auth_provider',
] as const

/** Union of the static list and whatever the loaded pages actually contain. */
export function entityTypeOptions(loaded: Iterable<string>): string[] {
  return [...new Set<string>([...STATIC_ENTITY_TYPES, ...loaded])].sort()
}

/** First id segment — enough to recognize an entity without the full UUID. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}
