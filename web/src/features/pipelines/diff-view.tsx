import { useMemo } from 'react'
import { diffLines } from 'diff'
import { cn } from '@/lib/utils'

interface DiffRow {
  kind: 'added' | 'removed' | 'context'
  text: string
}

/** Simple line diff with +/- gutters — enough to compare rendered configs. */
export function DiffView({
  before,
  after,
  beforeLabel,
  afterLabel,
  className,
}: {
  before: string
  after: string
  beforeLabel: string
  afterLabel: string
  className?: string
}) {
  const rows = useMemo<DiffRow[]>(() => {
    const parts = diffLines(before, after)
    const out: DiffRow[] = []
    for (const part of parts) {
      const kind: DiffRow['kind'] = part.added ? 'added' : part.removed ? 'removed' : 'context'
      const lines = part.value.split('\n')
      // A part ending in '\n' produces one trailing empty element — drop it.
      if (lines.at(-1) === '') lines.pop()
      for (const text of lines) out.push({ kind, text })
    }
    return out
  }, [before, after])

  const unchanged = rows.every((row) => row.kind === 'context')

  return (
    <div className={cn('overflow-hidden rounded-md border border-line bg-surface-2', className)}>
      <div className="flex items-center gap-3 border-b border-line px-3 py-1.5 font-mono text-[11px]">
        <span className="text-danger">− {beforeLabel}</span>
        <span className="text-ok">+ {afterLabel}</span>
        {unchanged && <span className="ml-auto text-ink-3">identical</span>}
      </div>
      <div className="overflow-x-auto">
        <pre className="min-w-full py-2 font-mono text-xs leading-5">
          {rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                'flex px-3',
                row.kind === 'added' && 'bg-ok/10 text-ok',
                row.kind === 'removed' && 'bg-danger/10 text-danger',
                row.kind === 'context' && 'text-ink-2',
              )}
            >
              <span aria-hidden className="w-4 shrink-0 select-none">
                {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}
              </span>
              <span className="whitespace-pre">{row.text}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
