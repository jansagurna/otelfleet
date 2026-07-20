import { Fragment, useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronRight, ArrowRight } from 'lucide-react'
import { queryLogs } from '@/api/generated'
import type { Interval } from '@/lib/time-range'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import { severityMeta, SEVERITY_FILTERS, type SeverityTone } from '@/features/explore/severity'
import { ErrorState } from '@/components/error-state'
import { TerminalHint, TELEMETRYGEN_COMMAND } from '@/components/terminal-hint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { LogRecord } from '@/api/generated'

const PAGE_SIZE = 100

export interface LogsFilters {
  q?: string
  service?: string
  minSeverity?: number
}

export function LogsView({
  customerId,
  interval,
  q,
  service,
  minSeverity,
  onChange,
  onOpenTrace,
}: {
  customerId: string
  interval: Interval
  onChange: (patch: LogsFilters) => void
  onOpenTrace: (traceId: string) => void
} & LogsFilters) {
  const logsQuery = useInfiniteQuery({
    queryKey: ['queryLogs', customerId, { ...interval, q, service, minSeverity }],
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await queryLogs({
        path: { customerId },
        query: {
          from: interval.from,
          to: interval.to,
          limit: PAGE_SIZE,
          ...(q ? { q } : {}),
          ...(service ? { service } : {}),
          ...(minSeverity ? { minSeverity } : {}),
          ...(pageParam ? { before: pageParam } : {}),
        },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  })

  const logs = useMemo(
    () => logsQuery.data?.pages.flatMap((page) => page.logs) ?? [],
    [logsQuery.data],
  )

  // Discovered services from the rows we've loaded (no dedicated endpoint).
  const services = useMemo(() => {
    const set = new Set<string>()
    for (const log of logs) if (log.serviceName) set.add(log.serviceName)
    if (service) set.add(service) // keep the active filter selectable
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [logs, service])

  const filtered = q !== undefined || service !== undefined || minSeverity !== undefined

  return (
    <div className="flex flex-col gap-4">
      <LogsFilterBar
        q={q}
        service={service}
        minSeverity={minSeverity}
        services={services}
        onChange={onChange}
      />

      {logsQuery.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      )}

      {logsQuery.isError && (
        <ErrorState title="Could not load logs" onRetry={() => void logsQuery.refetch()} />
      )}

      {logsQuery.isSuccess &&
        (logs.length === 0 ? (
          filtered ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
              <div className="text-sm font-semibold text-ink">No logs match the filters</div>
              <p className="max-w-md text-[13px] text-ink-2">
                Loosen the search, service, or severity filters — or widen the time range.
              </p>
            </div>
          ) : (
            <TerminalHint
              title="No logs in this window"
              body="Once this customer's agents ship logs they'll stream in here, newest first. Send a test batch with telemetrygen:"
              command={TELEMETRYGEN_COMMAND}
            />
          )
        ) : (
          <>
            <LogsTable logs={logs} onOpenTrace={onOpenTrace} />
            <div className="flex items-center justify-center gap-3 pb-2">
              {logsQuery.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logsQuery.isFetchingNextPage}
                  onClick={() => void logsQuery.fetchNextPage()}
                >
                  {logsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              ) : (
                <span className="text-xs text-ink-3">
                  End of logs for this window · {logs.length}{' '}
                  {logs.length === 1 ? 'line' : 'lines'}
                </span>
              )}
            </div>
          </>
        ))}
    </div>
  )
}

function LogsFilterBar({
  q,
  service,
  minSeverity,
  services,
  onChange,
}: LogsFilters & {
  services: string[]
  onChange: (patch: LogsFilters) => void
}) {
  const [text, setText] = useState(q ?? '')
  const debounced = useDebouncedValue(text, 400)

  useEffect(() => {
    const next = debounced.trim() === '' ? undefined : debounced.trim()
    if (next !== q) onChange({ q: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to the debounced text
  }, [debounced])

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logs-search">Search body</Label>
        <Input
          id="logs-search"
          className="w-64 font-mono"
          placeholder="substring in log body…"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logs-service">Service</Label>
        <Select
          id="logs-service"
          className="w-48"
          value={service ?? ''}
          onChange={(e) => onChange({ service: e.target.value === '' ? undefined : e.target.value })}
        >
          <option value="">All services</option>
          {services.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logs-severity">Severity</Label>
        <Select
          id="logs-severity"
          className="w-44"
          value={minSeverity ?? 0}
          onChange={(e) => {
            const value = Number(e.target.value)
            onChange({ minSeverity: value === 0 ? undefined : value })
          }}
        >
          {SEVERITY_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}

const TONE_CLASS: Record<SeverityTone, string> = {
  error: 'border-danger/40 bg-danger/10 text-danger',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  info: 'border-line bg-surface-2 text-ink-2',
  muted: 'border-line bg-transparent text-ink-3',
}

function SeverityChip({ severityNumber, severityText }: { severityNumber: number; severityText: string }) {
  const meta = severityMeta(severityNumber, severityText)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide',
        TONE_CLASS[meta.tone],
      )}
      title={`SeverityNumber ${severityNumber}`}
    >
      {meta.label}
    </span>
  )
}

function LogsTable({
  logs,
  onOpenTrace,
}: {
  logs: LogRecord[]
  onOpenTrace: (traceId: string) => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())

  const toggle = (index: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  return (
    <section className="rounded-lg border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8" aria-label="Expand" />
            <TableHead className="w-28">Time</TableHead>
            <TableHead className="w-20">Severity</TableHead>
            <TableHead className="w-40">Service</TableHead>
            <TableHead>Body</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log, index) => {
            const isOpen = expanded.has(index)
            const attributes = Object.entries(log.attributes ?? {})
            return (
              <Fragment key={`${log.timestamp}-${index}`}>
                <TableRow className="cursor-pointer align-top" onClick={() => toggle(index)}>
                  <TableCell className="w-8">
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        'size-3.5 text-ink-3 transition-transform',
                        isOpen && 'rotate-90',
                      )}
                    />
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs whitespace-nowrap text-ink-2 tabular-nums"
                    title={formatDateTime(log.timestamp)}
                  >
                    {formatRelative(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <SeverityChip
                      severityNumber={log.severityNumber}
                      severityText={log.severityText}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-ink-2">
                    <span className="block max-w-40 truncate" title={log.serviceName}>
                      {log.serviceName || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <span
                      className={cn(
                        'block font-mono text-xs text-ink',
                        isOpen ? 'break-all whitespace-pre-wrap' : 'truncate',
                      )}
                    >
                      {log.body}
                    </span>
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="bg-surface-2/40 py-3">
                      <div className="flex flex-col gap-3">
                        <pre className="overflow-x-auto font-mono text-[11px] leading-5 whitespace-pre-wrap text-ink-2">
                          {log.body}
                        </pre>
                        {log.traceId && (
                          <div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onOpenTrace(log.traceId as string)
                              }}
                              className="inline-flex items-center gap-1 rounded font-mono text-xs text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/70"
                            >
                              View trace {log.traceId.slice(0, 16)}…
                              <ArrowRight aria-hidden className="size-3" />
                            </button>
                          </div>
                        )}
                        {attributes.length > 0 && (
                          <dl className="grid max-w-3xl grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                            {attributes.map(([key, value]) => (
                              <div key={key} className="contents">
                                <dt className="font-mono text-[11px] text-ink-3">{key}</dt>
                                <dd className="font-mono text-[11px] break-all text-ink-2">
                                  {value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
