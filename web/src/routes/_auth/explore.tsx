import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Telescope } from 'lucide-react'
import { listCustomersOptions } from '@/api/generated/@tanstack/react-query.gen'
import {
  DEFAULT_TIME_RANGE,
  isTimeRange,
  rangeToInterval,
  type TimeRange,
} from '@/lib/time-range'
import { SIGNAL_COLOR } from '@/lib/chart-theme'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { LogsView } from '@/features/explore/logs-view'
import { TracesView } from '@/features/explore/traces-view'
import { TimeRangePicker } from '@/components/time-range-picker'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

type ExploreSignal = 'logs' | 'traces'

interface ExploreSearch {
  customerId?: string
  signal?: ExploreSignal
  range?: TimeRange
  // logs
  q?: string
  service?: string
  minSeverity?: number
  // traces
  name?: string
  errorsOnly?: boolean
  minDurationMs?: number
  traceId?: string
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

const posNum = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

export const Route = createFileRoute('/_auth/explore')({
  validateSearch: (search: Record<string, unknown>): ExploreSearch => ({
    customerId: str(search.customerId),
    signal: search.signal === 'traces' ? 'traces' : search.signal === 'logs' ? 'logs' : undefined,
    range: isTimeRange(search.range) ? search.range : undefined,
    q: str(search.q),
    service: str(search.service),
    minSeverity: posNum(search.minSeverity),
    name: str(search.name),
    errorsOnly: search.errorsOnly === true ? true : undefined,
    minDurationMs: posNum(search.minDurationMs),
    traceId: str(search.traceId),
  }),
  component: ExplorePage,
})

function ExplorePage() {
  const {
    customerId,
    signal = 'logs',
    range = DEFAULT_TIME_RANGE,
    q,
    service,
    minSeverity,
    name,
    errorsOnly,
    minDurationMs,
    traceId,
  } = Route.useSearch()
  const navigate = Route.useNavigate()

  const customersQuery = useQuery(listCustomersOptions())
  const customers = customersQuery.data?.customers ?? []
  const interval = rangeToInterval(range)

  const setSearch = (patch: Partial<ExploreSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Explore</h1>
        <p className="text-[13px] text-ink-2">
          Search a customer's stored logs and traces on the read path, newest first.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="explore-customer">Customer</Label>
          <Select
            id="explore-customer"
            className="w-64"
            value={customerId ?? ''}
            onChange={(e) =>
              // Switching customer drops the open trace (it's tenant-scoped).
              setSearch({
                customerId: e.target.value === '' ? undefined : e.target.value,
                traceId: undefined,
              })
            }
          >
            <option value="">Select a customer…</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </div>
        <SignalToggle
          value={signal}
          onChange={(next) =>
            setSearch({ signal: next, traceId: next === 'logs' ? undefined : traceId })
          }
        />
        <TimeRangePicker value={range} onChange={(next) => setSearch({ range: next })} />
      </div>

      {customerId === undefined ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-14 text-center">
          <Telescope className="size-5 text-ink-3" />
          <div className="text-sm font-semibold text-ink">Pick a customer to explore</div>
          <p className="max-w-md text-[13px] text-ink-2">
            The read path is per-tenant. Choose a customer above to search their{' '}
            {signal === 'logs' ? 'logs' : 'traces'} for the selected window.
          </p>
        </div>
      ) : signal === 'logs' ? (
        <LogsView
          key={customerId}
          customerId={customerId}
          interval={interval}
          q={q}
          service={service}
          minSeverity={minSeverity}
          onChange={setSearch}
          onOpenTrace={(id) => setSearch({ signal: 'traces', traceId: id })}
        />
      ) : (
        <TracesView
          key={customerId}
          customerId={customerId}
          interval={interval}
          name={name}
          service={service}
          errorsOnly={errorsOnly}
          minDurationMs={minDurationMs}
          traceId={traceId}
          onChange={setSearch}
        />
      )}
    </div>
  )
}

/** Segmented Logs | Traces control, each carrying its signal color. */
function SignalToggle({
  value,
  onChange,
}: {
  value: ExploreSignal
  onChange: (signal: ExploreSignal) => void
}) {
  const { theme } = useTheme()
  const options: { signal: ExploreSignal; label: string }[] = [
    { signal: 'logs', label: 'Logs' },
    { signal: 'traces', label: 'Traces' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Signal"
      className="inline-flex h-8 items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
    >
      {options.map(({ signal, label }) => {
        const active = signal === value
        return (
          <button
            key={signal}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(signal)}
            className={cn(
              'flex h-6.5 cursor-pointer items-center gap-1.5 rounded px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/70',
              active ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{
                background: active ? SIGNAL_COLOR[signal][theme] : 'currentColor',
                opacity: active ? 1 : 0.5,
              }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}
