import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { ReactNode } from 'react'

/**
 * Stat tile per the dataviz figure contract: sentence-case label, semibold
 * value in proportional figures, optional secondary hint. The colored key
 * (a small mark, never colored text) carries series identity.
 */
export function StatTile({
  label,
  value,
  unit,
  markColor,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  /** Series color swatch shown beside the label — identity via mark, not text. */
  markColor?: string
  hint?: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-1.5">
        {markColor && (
          <span
            aria-hidden
            className="h-2.5 w-0.75 rounded-[1px]"
            style={{ background: markColor }}
          />
        )}
        <div className="text-xs text-ink-2">{label}</div>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className={cn(
            'text-[26px] leading-8 font-semibold tracking-tight',
            tone === 'danger' ? 'text-danger' : 'text-ink',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  )
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-8 w-16" />
    </div>
  )
}
