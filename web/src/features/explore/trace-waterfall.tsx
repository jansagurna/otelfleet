import { useState } from 'react'
import { formatDurationMs } from '@/lib/format'
import { CATEGORICAL_COLOR } from '@/lib/chart-theme'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  barGeometry,
  buildSpanTree,
  computeTraceWindow,
  isErrorSpan,
  serviceColorIndex,
} from '@/features/explore/waterfall-math'
import type { Span } from '@/api/generated'

/**
 * Self-contained span waterfall — plain divs + CSS, no chart dependency.
 * Rows are ordered by the parent/child walk and indented by depth; each bar is
 * positioned and scaled against the whole-trace window and colored by service
 * (error spans go red). Clicking a row reveals its status + attributes.
 */
export function TraceWaterfall({ spans }: { spans: Span[] }) {
  const { theme } = useTheme()
  const palette = CATEGORICAL_COLOR[theme]
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (spans.length === 0) {
    return <p className="px-1 py-6 text-center text-[13px] text-ink-3">This trace has no spans.</p>
  }

  const window = computeTraceWindow(spans)
  const nodes = buildSpanTree(spans)
  const colorIndex = serviceColorIndex(spans)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-[11px] text-ink-3 tabular-nums">
        <span className="font-mono">0 ms</span>
        <span>{spans.length} spans</span>
        <span className="font-mono">{formatDurationMs(window.durationMs)}</span>
      </div>
      <div className="flex flex-col">
        {nodes.map(({ span, depth }) => {
          const geom = barGeometry(span, window)
          const failed = isErrorSpan(span)
          const color = failed
            ? 'var(--danger)'
            : palette[(colorIndex.get(span.service) ?? 0) % palette.length]
          const isOpen = selectedId === span.spanId
          return (
            <div
              key={span.spanId}
              className={cn(
                'border-b border-line/60 last:border-0',
                isOpen && 'bg-surface-2/40',
              )}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setSelectedId(isOpen ? null : span.spanId)}
                className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 py-1.5 pr-1 text-left outline-none hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <div
                  className="flex min-w-0 items-center gap-2"
                  style={{ paddingLeft: `${depth * 14}px` }}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 truncate font-mono text-xs text-ink" title={span.name}>
                    {span.name}
                  </span>
                  {failed && (
                    <span className="shrink-0 font-mono text-[10px] font-semibold text-danger">
                      ERROR
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative h-4 min-w-0 flex-1 rounded-sm bg-surface-2">
                    <div
                      className="absolute inset-y-0 rounded-sm"
                      style={{
                        left: `${geom.leftPct}%`,
                        width: `${geom.widthPct}%`,
                        background: color,
                      }}
                      title={`${span.service} · ${formatDurationMs(span.durationMs)}`}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-[11px] text-ink-2 tabular-nums">
                    {formatDurationMs(span.durationMs)}
                  </span>
                </div>
              </button>
              {isOpen && <SpanDetail span={span} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SpanDetail({ span }: { span: Span }) {
  const attributes = Object.entries(span.attributes ?? {})
  return (
    <div className="flex flex-col gap-2 px-1 pt-1 pb-3 text-xs">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-ink-3">Service</dt>
        <dd className="font-mono text-ink-2">{span.service}</dd>
        <dt className="text-ink-3">Span ID</dt>
        <dd className="truncate font-mono text-ink-2">{span.spanId}</dd>
        <dt className="text-ink-3">Kind</dt>
        <dd className="font-mono text-ink-2">{span.kind}</dd>
        <dt className="text-ink-3">Status</dt>
        <dd
          className={cn(
            'font-mono',
            isErrorSpan(span) ? 'text-danger' : 'text-ink-2',
          )}
        >
          {span.statusCode}
          {span.statusMessage ? ` — ${span.statusMessage}` : ''}
        </dd>
      </dl>
      {attributes.length > 0 && (
        <div className="rounded-md border border-line bg-surface p-2">
          <div className="mb-1 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">
            Attributes
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            {attributes.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-mono text-[11px] text-ink-3">{key}</dt>
                <dd className="font-mono text-[11px] break-all text-ink-2">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
