import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getTraceOptions } from '@/api/generated/@tanstack/react-query.gen'
import { queryTraces } from '@/api/generated'
import type { Interval } from '@/lib/time-range'
import { formatDateTime, formatDurationMs, formatRelative } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { TraceWaterfall } from '@/features/explore/trace-waterfall'
import { ErrorState } from '@/components/error-state'
import { TerminalHint } from '@/components/terminal-hint'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TraceSummary } from '@/api/generated'

const PAGE_SIZE = 100

const TRACES_TELEMETRYGEN =
  "telemetrygen traces --otlp-insecure --otlp-endpoint localhost:4317 --otlp-header 'authorization=\"Bearer <key>\"'"

export interface TracesFilters {
  name?: string
  service?: string
  errorsOnly?: boolean
  minDurationMs?: number
}

export function TracesView({
  customerId,
  interval,
  name,
  service,
  errorsOnly,
  minDurationMs,
  traceId,
  onChange,
}: {
  customerId: string
  interval: Interval
  traceId?: string
  onChange: (patch: TracesFilters & { traceId?: string }) => void
} & TracesFilters) {
  const tracesQuery = useInfiniteQuery({
    queryKey: [
      'queryTraces',
      customerId,
      { ...interval, name, service, errorsOnly, minDurationMs },
    ],
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await queryTraces({
        path: { customerId },
        query: {
          from: interval.from,
          to: interval.to,
          limit: PAGE_SIZE,
          ...(name ? { name } : {}),
          ...(service ? { service } : {}),
          ...(errorsOnly ? { errorsOnly: true } : {}),
          ...(minDurationMs ? { minDurationMs } : {}),
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

  const traces = useMemo(
    () => tracesQuery.data?.pages.flatMap((page) => page.traces) ?? [],
    [tracesQuery.data],
  )

  const services = useMemo(() => {
    const set = new Set<string>()
    for (const trace of traces) if (trace.rootService) set.add(trace.rootService)
    if (service) set.add(service)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [traces, service])

  const filtered =
    name !== undefined ||
    service !== undefined ||
    errorsOnly !== undefined ||
    minDurationMs !== undefined

  return (
    <div className="flex flex-col gap-4">
      <TracesFilterBar
        name={name}
        service={service}
        errorsOnly={errorsOnly}
        minDurationMs={minDurationMs}
        services={services}
        onChange={onChange}
      />

      {tracesQuery.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      )}

      {tracesQuery.isError && (
        <ErrorState title="Could not load traces" onRetry={() => void tracesQuery.refetch()} />
      )}

      {tracesQuery.isSuccess &&
        (traces.length === 0 ? (
          filtered ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
              <div className="text-sm font-semibold text-ink">No traces match the filters</div>
              <p className="max-w-md text-[13px] text-ink-2">
                Loosen the name, service, duration, or errors-only filters — or widen the time
                range.
              </p>
            </div>
          ) : (
            <TerminalHint
              title="No traces in this window"
              body="Spans roll up into one row per trace here, newest first. Send a test trace with telemetrygen:"
              command={TRACES_TELEMETRYGEN}
            />
          )
        ) : (
          <>
            <TracesTable traces={traces} onOpen={(id) => onChange({ traceId: id })} />
            <div className="flex items-center justify-center gap-3 pb-2">
              {tracesQuery.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={tracesQuery.isFetchingNextPage}
                  onClick={() => void tracesQuery.fetchNextPage()}
                >
                  {tracesQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              ) : (
                <span className="text-xs text-ink-3">
                  End of traces for this window · {traces.length}{' '}
                  {traces.length === 1 ? 'trace' : 'traces'}
                </span>
              )}
            </div>
          </>
        ))}

      <TraceDetailSheet
        customerId={customerId}
        traceId={traceId}
        onClose={() => onChange({ traceId: undefined })}
      />
    </div>
  )
}

function TracesFilterBar({
  name,
  service,
  errorsOnly,
  minDurationMs,
  services,
  onChange,
}: TracesFilters & {
  services: string[]
  onChange: (patch: TracesFilters) => void
}) {
  const [nameInput, setNameInput] = useState(name ?? '')
  const debouncedName = useDebouncedValue(nameInput, 400)
  const [durationInput, setDurationInput] = useState(
    minDurationMs !== undefined ? String(minDurationMs) : '',
  )
  const debouncedDuration = useDebouncedValue(durationInput, 400)

  useEffect(() => {
    const next = debouncedName.trim() === '' ? undefined : debouncedName.trim()
    if (next !== name) onChange({ name: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to the debounced text
  }, [debouncedName])

  useEffect(() => {
    const parsed = Number(debouncedDuration)
    const next = debouncedDuration.trim() === '' || !Number.isFinite(parsed) || parsed <= 0
      ? undefined
      : parsed
    if (next !== minDurationMs) onChange({ minDurationMs: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to the debounced value
  }, [debouncedDuration])

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="traces-name">Root name</Label>
        <Input
          id="traces-name"
          className="w-56 font-mono"
          placeholder="substring in root span…"
          spellCheck={false}
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="traces-service">Service</Label>
        <Select
          id="traces-service"
          className="w-48"
          value={service ?? ''}
          onChange={(e) => onChange({ service: e.target.value === '' ? undefined : e.target.value })}
        >
          <option value="">All services</option>
          {services.map((svc) => (
            <option key={svc} value={svc}>
              {svc}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="traces-min-duration">Min duration (ms)</Label>
        <Input
          id="traces-min-duration"
          type="number"
          min={0}
          className="w-32 font-mono tabular-nums"
          placeholder="0"
          value={durationInput}
          onChange={(e) => setDurationInput(e.target.value)}
        />
      </div>
      <label className="flex h-8 cursor-pointer items-center gap-2 text-xs text-ink-2 select-none">
        <Switch
          aria-label="Errors only"
          checked={errorsOnly ?? false}
          onCheckedChange={(checked) => onChange({ errorsOnly: checked ? true : undefined })}
        />
        Errors only
      </label>
    </div>
  )
}

function TracesTable({
  traces,
  onOpen,
}: {
  traces: TraceSummary[]
  onOpen: (traceId: string) => void
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-40">Service</TableHead>
            <TableHead>Root span</TableHead>
            <TableHead className="w-28">Started</TableHead>
            <TableHead className="w-24 text-right">Duration</TableHead>
            <TableHead className="w-16 text-right">Spans</TableHead>
            <TableHead className="w-20">Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {traces.map((trace) => (
            <TableRow
              key={trace.traceId}
              className="cursor-pointer"
              onClick={() => onOpen(trace.traceId)}
            >
              <TableCell className="font-mono text-xs text-ink-2">
                <span className="block max-w-40 truncate" title={trace.rootService}>
                  {trace.rootService || '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-ink" title={trace.rootName}>
                  {trace.rootName || '—'}
                </span>
              </TableCell>
              <TableCell
                className="text-xs whitespace-nowrap text-ink-2 tabular-nums"
                title={formatDateTime(trace.startTime)}
              >
                {formatRelative(trace.startTime)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-ink tabular-nums">
                {formatDurationMs(trace.durationMs)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-ink-2 tabular-nums">
                {trace.spanCount}
              </TableCell>
              <TableCell>
                {trace.errorCount > 0 ? (
                  <Badge variant="danger" className="font-mono">
                    {trace.errorCount}
                  </Badge>
                ) : (
                  <span className="text-xs text-ink-3">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

function TraceDetailSheet({
  customerId,
  traceId,
  onClose,
}: {
  customerId: string
  traceId?: string
  onClose: () => void
}) {
  const traceQuery = useQuery({
    ...getTraceOptions({ path: { customerId, traceId: traceId ?? '' } }),
    enabled: traceId !== undefined,
  })

  return (
    <Sheet open={traceId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full sm:max-w-3xl"
        title="Trace detail"
        description={traceId ? `${traceId.slice(0, 24)}…` : undefined}
      >
        {traceId === undefined ? null : traceQuery.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : traceQuery.isError ? (
          <ErrorState title="Could not load trace" onRetry={() => void traceQuery.refetch()} />
        ) : (
          <TraceWaterfall spans={traceQuery.data.spans} />
        )}
      </SheetContent>
    </Sheet>
  )
}
