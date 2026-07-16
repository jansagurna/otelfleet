import { Link } from '@tanstack/react-router'
import { Network } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Pipeline } from '@/api/generated'

/** forwarding / edge target-class chip used in tables and the editor header. */
export function TargetClassBadge({ targetClass }: { targetClass: Pipeline['targetClass'] }) {
  return <Badge className="font-mono">{targetClass}</Badge>
}

/** "v3 active" / "draft only" chip used in tables and the editor header. */
export function ActiveVersionBadge({ pipeline }: { pipeline: Pipeline }) {
  if (pipeline.activeVersion != null) {
    return (
      <Badge dot variant="ok">
        v{pipeline.activeVersion} active
      </Badge>
    )
  }
  return <Badge variant="neutral">draft only</Badge>
}

/**
 * Shared pipelines table — the all-pipelines page and the customer tab render
 * the same rows, minus the customer column on the customer's own page.
 */
export function PipelinesTable({
  pipelines,
  showCustomer,
  emptyHint,
}: {
  pipelines: Pipeline[]
  showCustomer: boolean
  emptyHint: string
}) {
  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
        <Network className="size-5 text-ink-3" />
        <div className="text-sm font-semibold text-ink">No pipelines yet</div>
        <p className="max-w-md text-[13px] text-ink-2">{emptyHint}</p>
      </div>
    )
  }

  return (
    <section className="rounded-lg border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            {showCustomer && <TableHead>Customer</TableHead>}
            <TableHead>Class</TableHead>
            <TableHead>Active version</TableHead>
            <TableHead>Latest</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pipelines.map((pipeline) => (
            <TableRow key={pipeline.id}>
              <TableCell>
                <Link
                  to="/pipelines/$pipelineId"
                  params={{ pipelineId: pipeline.id }}
                  className="rounded font-medium text-ink outline-none hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {pipeline.name}
                </Link>
              </TableCell>
              {showCustomer && (
                <TableCell>
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: pipeline.customerId }}
                    className="rounded text-[13px] text-ink-2 outline-none hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    {pipeline.customerName ?? pipeline.customerId}
                  </Link>
                </TableCell>
              )}
              <TableCell>
                <TargetClassBadge targetClass={pipeline.targetClass} />
              </TableCell>
              <TableCell>
                <ActiveVersionBadge pipeline={pipeline} />
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-ink-2">
                  {pipeline.latestVersion != null ? `v${pipeline.latestVersion}` : '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-ink-2 tabular-nums">
                  {formatDate(pipeline.createdAt)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
