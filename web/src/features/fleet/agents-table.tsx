import { Link, useNavigate } from '@tanstack/react-router'
import { agentDisplayName } from '@/features/fleet/agent-status'
import { AgentClassBadge, ConfigChip, StatusDot } from '@/features/fleet/badges'
import { formatDateTime, formatRelative } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Agent } from '@/api/generated'

/** Fleet table — full rows are clickable and lead to the agent detail. */
export function AgentsTable({ agents }: { agents: Agent[] }) {
  const navigate = useNavigate()

  return (
    <section className="rounded-lg border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Config</TableHead>
            <TableHead>Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow
              key={agent.id}
              className="cursor-pointer"
              onClick={() =>
                void navigate({ to: '/fleet/$agentId', params: { agentId: agent.id } })
              }
            >
              <TableCell>
                <StatusDot agent={agent} />
              </TableCell>
              <TableCell>
                <Link
                  to="/fleet/$agentId"
                  params={{ agentId: agent.id }}
                  className="rounded font-mono text-xs font-medium text-ink outline-none hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {agentDisplayName(agent)}
                </Link>
              </TableCell>
              <TableCell>
                <AgentClassBadge agentClass={agent.class} />
              </TableCell>
              <TableCell>
                {agent.customerId != null ? (
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: agent.customerId }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded text-[13px] text-ink-2 outline-none hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    {agent.customerName ?? agent.customerId}
                  </Link>
                ) : (
                  <span className="text-xs text-ink-3">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-ink-2">{agent.agentVersion ?? '—'}</span>
              </TableCell>
              <TableCell>
                <ConfigChip agent={agent} />
              </TableCell>
              <TableCell>
                <span
                  className="text-xs text-ink-2 tabular-nums"
                  title={agent.lastSeenAt != null ? formatDateTime(agent.lastSeenAt) : undefined}
                >
                  {agent.lastSeenAt != null ? formatRelative(agent.lastSeenAt) : 'Never'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
