import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { getPipelineStageStatsOptions } from '@/api/generated/@tanstack/react-query.gen'
import { rangeToInterval, type TimeRange } from '@/lib/time-range'
import { formatCompact, formatNumber } from '@/lib/format'
import { SIGNAL_COLOR, SIGNAL_LABEL, SIGNALS } from '@/lib/chart-theme'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/stat-tile'
import { ErrorState } from '@/components/error-state'
import { TimeRangePicker } from '@/components/time-range-picker'
import type { PipelineStageStats } from '@/api/generated'

/**
 * Stage metrics tab: received-per-signal tiles flowing into per-exporter
 * cards (sent / failed / queue fill), from collector self-telemetry.
 */
export function StageMetricsTab({
  pipelineId,
  range,
  onRangeChange,
}: {
  pipelineId: string
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
}) {
  const interval = rangeToInterval(range)
  const statsQuery = useQuery(
    getPipelineStageStatsOptions({
      path: { pipelineId },
      query: { from: interval.from, to: interval.to },
    }),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">Pipeline flow</h2>
        <TimeRangePicker value={range} onChange={onRangeChange} />
      </div>

      {statsQuery.isPending && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {statsQuery.isError && (
        <ErrorState
          title="Could not load stage metrics"
          onRetry={() => void statsQuery.refetch()}
        />
      )}
      {statsQuery.isSuccess && <StageFlow stats={statsQuery.data} />}
    </div>
  )
}

function StageFlow({ stats }: { stats: PipelineStageStats }) {
  const { theme } = useTheme()
  const receivedBySignal = new Map(stats.received.map((r) => [r.signal, r.items]))
  const hasData =
    stats.received.some((r) => r.items > 0) ||
    stats.exporters.some((e) => e.sent > 0 || e.sendFailed > 0 || (e.enqueueFailed ?? 0) > 0)

  if (!hasData) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
        <div className="text-sm font-semibold text-ink">No stage metrics in this range</div>
        <p className="max-w-lg text-[13px] text-ink-2">
          Flow data comes from the forwarding collector&apos;s self-telemetry. It appears once a
          version is active and the forwarding collector has been restarted with it — then give it
          a minute to scrape.
        </p>
      </div>
    )
  }

  const shownSignals = SIGNALS.filter((s) => receivedBySignal.has(s))

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
      <div className="flex shrink-0 flex-col gap-3 xl:w-64" aria-label="Received">
        {(shownSignals.length > 0 ? shownSignals : SIGNALS).map((signal) => (
          <StatTile
            key={signal}
            label={`${SIGNAL_LABEL[signal]} received`}
            value={formatCompact(receivedBySignal.get(signal) ?? 0)}
            unit="items"
            markColor={SIGNAL_COLOR[signal][theme]}
          />
        ))}
      </div>

      <div aria-hidden className="flex items-center justify-center self-center text-ink-3 xl:pt-16">
        <ArrowRight className="size-5 rotate-90 xl:rotate-0" />
      </div>

      <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-2" aria-label="Exporters">
        {stats.exporters.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-6 text-center text-xs text-ink-3 lg:col-span-2">
            No exporter telemetry in this range.
          </p>
        ) : (
          stats.exporters.map((exporter) => <ExporterCard key={exporter.name} exporter={exporter} />)
        )}
      </div>
    </div>
  )
}

function ExporterCard({ exporter }: { exporter: PipelineStageStats['exporters'][number] }) {
  const enqueueFailed = exporter.enqueueFailed ?? 0
  const fill =
    exporter.queueCapacity > 0
      ? Math.min(100, Math.round((exporter.queueSize / exporter.queueCapacity) * 100))
      : 0
  const queueTone = fill > 70 ? 'warn' : 'ok'

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 truncate font-mono text-[13px] font-semibold text-ink">
          {exporter.name}
        </code>
        <Badge className="ml-auto font-mono">{exporter.type}</Badge>
      </header>

      <dl className="grid grid-cols-3 gap-2">
        <FlowStat label="Sent" value={exporter.sent} />
        <FlowStat label="Send failed" value={exporter.sendFailed} danger={exporter.sendFailed > 0} />
        <FlowStat label="Enqueue failed" value={enqueueFailed} danger={enqueueFailed > 0} />
      </dl>

      <div>
        <div className="flex items-baseline justify-between text-[11px] text-ink-3">
          <span>Queue</span>
          <span className="font-mono tabular-nums">
            {formatNumber(exporter.queueSize)} / {formatNumber(exporter.queueCapacity)} ({fill}%)
          </span>
        </div>
        <div
          role="meter"
          aria-label={`Queue fill for ${exporter.name}`}
          aria-valuenow={fill}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={cn('h-full rounded-full', queueTone === 'warn' ? 'bg-warn' : 'bg-ok')}
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>
    </article>
  )
}

function FlowStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-2/50 px-2.5 py-2">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-[15px] font-semibold tabular-nums',
          danger ? 'text-danger' : 'text-ink',
        )}
        title={formatNumber(value)}
      >
        {formatCompact(value)}
      </dd>
    </div>
  )
}
