import { useQuery } from '@tanstack/react-query'
import {
  BadgePlus,
  CircleCheck,
  CircleX,
  HeartCrack,
  HeartPulse,
  History,
  PlugZap,
  Unplug,
} from 'lucide-react'
import { listAgentEventsOptions } from '@/api/generated/@tanstack/react-query.gen'
import { formatDateTime, formatRelative } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import { cn } from '@/lib/utils'
import type { AgentEvent } from '@/api/generated'
import type { ComponentType } from 'react'

const EVENT_META: Record<
  AgentEvent['eventType'],
  { icon: ComponentType<{ className?: string }>; label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }
> = {
  enrolled: { icon: BadgePlus, label: 'Enrolled', tone: 'ok' },
  connected: { icon: PlugZap, label: 'Connected', tone: 'ok' },
  disconnected: { icon: Unplug, label: 'Disconnected', tone: 'neutral' },
  config_applied: { icon: CircleCheck, label: 'Config applied', tone: 'ok' },
  config_failed: { icon: CircleX, label: 'Config failed', tone: 'danger' },
  healthy: { icon: HeartPulse, label: 'Healthy', tone: 'ok' },
  unhealthy: { icon: HeartCrack, label: 'Unhealthy', tone: 'warn' },
}

const TONE_TEXT = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  neutral: 'text-ink-3',
} as const

/** Timeline of agent lifecycle events, newest first, polled with the page. */
export function AgentEventsTab({ agentId }: { agentId: string }) {
  const eventsQuery = useQuery({
    ...listAgentEventsOptions({ path: { agentId } }),
    refetchInterval: 10_000,
  })

  if (eventsQuery.isPending) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    )
  }
  if (eventsQuery.isError) {
    return <ErrorState title="Could not load events" onRetry={() => void eventsQuery.refetch()} />
  }

  const events = eventsQuery.data.events
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
        <History className="size-5 text-ink-3" />
        <div className="text-sm font-semibold text-ink">No events yet</div>
        <p className="max-w-md text-[13px] text-ink-2">
          Lifecycle events (enrollment, connects, config pushes, health changes) appear here as the
          agent reports them.
        </p>
      </div>
    )
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <ol aria-label="Agent events" className="flex flex-col">
        {events.map((event, i) => (
          <EventRow key={event.id} event={event} last={i === events.length - 1} />
        ))}
      </ol>
    </section>
  )
}

function EventRow({ event, last }: { event: AgentEvent; last: boolean }) {
  const meta = EVENT_META[event.eventType]
  const Icon = meta.icon
  const hasDetail = event.detail != null && Object.keys(event.detail).length > 0

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2',
            TONE_TEXT[meta.tone],
          )}
        >
          <Icon className="size-3.5" />
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-line" />}
      </div>
      <div className={cn('min-w-0 flex-1', !last && 'pb-4')}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[13px] font-medium text-ink">{meta.label}</span>
          <span
            className="text-[11px] text-ink-3 tabular-nums"
            title={formatDateTime(event.createdAt)}
          >
            {formatRelative(event.createdAt)}
          </span>
        </div>
        {hasDetail && (
          <details className="mt-1">
            <summary className="cursor-pointer rounded font-mono text-[11px] text-ink-3 outline-none select-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/70">
              detail
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-line bg-surface-2 p-2.5 font-mono text-[11px] leading-4 whitespace-pre-wrap text-ink-2">
              {JSON.stringify(event.detail, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </li>
  )
}
