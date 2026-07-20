import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getCostStatsOptions } from '@/api/generated/@tanstack/react-query.gen'
import {
  EXTENDED_TIME_RANGES,
  isTimeRange,
  RANGE_LABEL,
  rangeToInterval,
  type TimeRange,
} from '@/lib/time-range'
import { formatBytes, formatCompact } from '@/lib/format'
import { costTotals, rankCustomers } from '@/features/costs/cost-math'
import { CostChart, CostChartSkeleton } from '@/features/costs/cost-chart'
import { TimeRangePicker } from '@/components/time-range-picker'
import { StatTile, StatTileSkeleton } from '@/components/stat-tile'
import { ErrorState } from '@/components/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CustomerCost } from '@/api/generated'

const COSTS_DEFAULT_RANGE: TimeRange = '30d'

interface CostsSearch {
  range?: TimeRange
}

export const Route = createFileRoute('/_auth/costs')({
  validateSearch: (search: Record<string, unknown>): CostsSearch => ({
    range: isTimeRange(search.range) ? search.range : undefined,
  }),
  component: CostsPage,
})

function CostsPage() {
  const { range = COSTS_DEFAULT_RANGE } = Route.useSearch()
  const navigate = Route.useNavigate()
  const interval = rangeToInterval(range)

  const query = useQuery(getCostStatsOptions({ query: { from: interval.from, to: interval.to } }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Costs</h1>
          <p className="text-[13px] text-ink-2">
            Ingest volume per customer, {RANGE_LABEL[range].toLowerCase()}
          </p>
        </div>
        <TimeRangePicker
          value={range}
          ranges={EXTENDED_TIME_RANGES}
          onChange={(next) => void navigate({ search: { range: next }, replace: true })}
        />
      </div>

      {query.isPending && <CostsSkeleton />}
      {query.isError && (
        <ErrorState title="Could not load cost stats" onRetry={() => void query.refetch()} />
      )}
      {query.isSuccess && <CostsBody customers={query.data.customers} />}
    </div>
  )
}

function CostsBody({ customers }: { customers: CustomerCost[] }) {
  const totals = costTotals(customers)
  const ranked = rankCustomers(customers)

  if (customers.length === 0 || totals.items === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface p-10 text-center text-[13px] text-ink-2">
        No ingest volume in this period yet.
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total ingested" value={formatBytes(totals.bytes)} />
        <StatTile label="Total items" value={formatCompact(totals.items)} />
        <StatTile label="Top customer" value={totals.top?.name ?? '—'} />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <CostChart customers={customers} />
        <p className="mt-2 text-[11px] text-ink-3">
          Bytes are estimated ingest volume (uncompressed in-memory size), not
          compressed size at rest. Data from before the v0.5 upgrade counts 0 bytes.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Bytes</TableHead>
              <TableHead className="w-40">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((c) => {
              const share = totals.bytes > 0 ? c.bytes / totals.bytes : 0
              return (
                <TableRow key={c.customerId}>
                  <TableCell>
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: c.customerId }}
                      className="text-ink hover:text-accent"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-ink-2">
                    {formatCompact(c.items)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-ink-2">
                    {formatBytes(c.bytes)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-[11px] tabular-nums text-ink-3">
                        {Math.round(share * 100)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function CostsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <CostChartSkeleton />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
