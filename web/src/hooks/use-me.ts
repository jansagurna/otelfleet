import { useQuery } from '@tanstack/react-query'
import { getMeOptions } from '@/api/generated/@tanstack/react-query.gen'
import type { Me } from '@/api/generated'

/**
 * Current session user. The /_auth guard has already primed this query,
 * so inside the authenticated layout data is available from cache.
 */
export function useMe(): Me | undefined {
  const { data } = useQuery(getMeOptions())
  return data
}

/** Viewers see a read-only console; operators and admins can mutate. */
export function canMutate(me: Me | undefined): boolean {
  return me !== undefined && me.role !== 'viewer'
}
