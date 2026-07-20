import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import {
  deleteAgentMutation,
  getAgentOptions,
  listAgentsQueryKey,
  syncAgentMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { agentDisplayName, configChip, shortHash } from '@/features/fleet/agent-status'
import { AgentClassBadge, ConfigChip, LabelChips, StatusDot } from '@/features/fleet/badges'
import { AgentConfigTab } from '@/features/fleet/agent-config'
import { AgentEventsTab } from '@/features/fleet/agent-events'
import { EditAgentDialog } from '@/features/fleet/edit-agent-dialog'
import { formatDateTime, formatRelative } from '@/lib/format'
import { apiErrorMessage } from '@/lib/api-error'
import { useMe, canMutate } from '@/hooks/use-me'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { toast } from '@/components/toaster'
import type { AgentDetail } from '@/api/generated'
import type { ReactNode } from 'react'

const TABS = ['overview', 'config', 'events'] as const
type Tab = (typeof TABS)[number]

interface AgentSearch {
  tab?: Tab
}

export const Route = createFileRoute('/_auth/fleet/$agentId')({
  validateSearch: (search: Record<string, unknown>): AgentSearch => ({
    tab: TABS.includes(search.tab as Tab) ? (search.tab as Tab) : undefined,
  }),
  component: AgentDetailPage,
})

function AgentDetailPage() {
  const { agentId } = Route.useParams()
  const { tab = 'overview' } = Route.useSearch()

  const agentQuery = useQuery({
    ...getAgentOptions({ path: { agentId } }),
    refetchInterval: 10_000,
  })

  if (agentQuery.isPending) return <AgentDetailSkeleton />
  if (agentQuery.isError) {
    return (
      <ErrorState
        title="Could not load this agent"
        detail="It may have been forgotten, or the request failed."
        onRetry={() => void agentQuery.refetch()}
      />
    )
  }

  const agent = agentQuery.data

  return (
    <div className="flex flex-col gap-5">
      <AgentHeader agent={agent} />
      <TabBar agentId={agentId} active={tab} />
      {tab === 'overview' && <OverviewTab agent={agent} />}
      {tab === 'config' && <AgentConfigTab agentId={agentId} />}
      {tab === 'events' && <AgentEventsTab agentId={agentId} />}
    </div>
  )
}

function AgentHeader({ agent }: { agent: AgentDetail }) {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmForget, setConfirmForget] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const isGateway = agent.class === 'gateway'

  const resync = useMutation({
    ...syncAgentMutation(),
    onSuccess: (result) => toast(result.detail),
    onError: (error) => toast(apiErrorMessage(error, 'Could not re-sync the agent'), 'danger'),
  })

  const forget = useMutation({
    ...deleteAgentMutation(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listAgentsQueryKey() })
      toast(`Agent "${agentDisplayName(agent)}" forgotten`)
      void navigate({ to: '/fleet' })
    },
    onError: (error) => {
      setConfirmForget(false)
      // A 409 means the agent reconnected between render and click.
      const message =
        error && typeof error === 'object' && 'message' in error && error.message
          ? String(error.message)
          : 'Could not forget the agent'
      toast(message, 'danger')
    },
  })

  return (
    <div className="flex flex-col gap-3">
      <Link
        to="/fleet"
        className="inline-flex w-fit items-center gap-1 rounded text-xs text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <ArrowLeft className="size-3" />
        Fleet
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-semibold text-ink">{agentDisplayName(agent)}</h1>
        <AgentClassBadge agentClass={agent.class} />
        <StatusDot agent={agent} showLabel />
        {canMutate(me) && (
          <div className="ml-auto flex items-center gap-2">
            <span
              title={
                isGateway
                  ? 'Gateway agents are not re-synced from here — edge config is per-customer.'
                  : undefined
              }
            >
              <Button
                variant="outline"
                size="sm"
                disabled={isGateway || resync.isPending}
                onClick={() => resync.mutate({ path: { agentId: agent.id } })}
              >
                <RefreshCw aria-hidden />
                {resync.isPending ? 'Re-syncing…' : 'Re-sync'}
              </Button>
            </span>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <span
              title={
                agent.connected
                  ? 'Connected agents cannot be forgotten — stop the agent first.'
                  : undefined
              }
            >
              <Button
                variant="danger"
                size="sm"
                disabled={agent.connected || forget.isPending}
                onClick={() => setConfirmForget(true)}
              >
                <Trash2 aria-hidden />
                Forget agent
              </Button>
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-2">
        <span>
          <span className="text-ink-3">customer</span>{' '}
          {agent.customerId != null ? (
            <Link
              to="/customers/$customerId"
              params={{ customerId: agent.customerId }}
              className="rounded outline-none hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              {agent.customerName ?? agent.customerId}
            </Link>
          ) : (
            '—'
          )}
        </span>
        <span>
          <span className="text-ink-3">version</span>{' '}
          <code className="font-mono">{agent.agentVersion ?? '—'}</code>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-ink-3">instance</span>
          <code className="font-mono">{agent.instanceUid}</code>
          <CopyButton value={agent.instanceUid} label="Copy instance UID" />
        </span>
        <span title={agent.lastSeenAt != null ? formatDateTime(agent.lastSeenAt) : undefined}>
          <span className="text-ink-3">last seen</span>{' '}
          {agent.lastSeenAt != null ? formatRelative(agent.lastSeenAt) : 'never'}
        </span>
      </div>
      <ConfirmDialog
        open={confirmForget}
        onOpenChange={setConfirmForget}
        title={`Forget ${agentDisplayName(agent)}?`}
        description="The agent, its config assignment, and its event history are removed. If it ever reconnects with a valid token it enrolls as a new agent."
        confirmLabel="Forget agent"
        destructive
        pending={forget.isPending}
        onConfirm={() => forget.mutate({ path: { agentId: agent.id } })}
      />
      <EditAgentDialog agent={agent} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

function TabBar({ agentId, active }: { agentId: string; active: Tab }) {
  const labels: Record<Tab, string> = { overview: 'Overview', config: 'Config', events: 'Events' }
  return (
    <nav aria-label="Agent sections" className="flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <Link
          key={tab}
          to="/fleet/$agentId"
          params={{ agentId }}
          search={(prev) => ({ ...prev, tab })}
          aria-current={active === tab ? 'page' : undefined}
          className={cn(
            '-mb-px rounded-t px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/70',
            active === tab
              ? 'border-b-2 border-accent font-medium text-ink'
              : 'border-b-2 border-transparent text-ink-2 hover:text-ink',
          )}
        >
          {labels[tab]}
        </Link>
      ))}
    </nav>
  )
}

// ---- overview ---------------------------------------------------------------

function OverviewTab({ agent }: { agent: AgentDetail }) {
  const hasLabels = Object.keys(agent.labels ?? {}).length > 0
  return (
    <div className="flex flex-col gap-4">
      {hasLabels && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-3">labels</span>
          <LabelChips labels={agent.labels} />
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <RemoteConfigCard agent={agent} />
        <HealthCard agent={agent} />
      </div>
      <DescriptionCard agent={agent} />
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  )
}

function RemoteConfigCard({ agent }: { agent: AgentDetail }) {
  const chip = configChip(agent)
  return (
    <Card title="Remote config">
      <div className="flex items-center gap-2">
        <ConfigChip agent={agent} />
        <span className="text-xs text-ink-3">status: {agent.remoteConfigStatus}</span>
      </div>
      {chip.label === 'failed' && agent.remoteConfigError != null && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-danger"
        >
          {agent.remoteConfigError}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-ink-3">assigned</dt>
        <dd>
          <code className="font-mono text-ink-2" title={agent.assignedConfigHash ?? undefined}>
            {shortHash(agent.assignedConfigHash)}
          </code>
        </dd>
        <dt className="text-ink-3" title="Re-serialized effective config the agent reports; not used for sync state.">
          reported
        </dt>
        <dd>
          <code className="font-mono text-ink-2" title={agent.reportedConfigHash ?? undefined}>
            {shortHash(agent.reportedConfigHash)}
          </code>
        </dd>
      </dl>
      <p className="text-[11px] text-ink-3">
        Sync state compares the assigned config against the one the agent acknowledged over OpAMP.
      </p>
    </Card>
  )
}

function HealthCard({ agent }: { agent: AgentDetail }) {
  return (
    <Card title="Health">
      <div>
        {agent.healthy === true && (
          <Badge dot variant="ok">
            Healthy
          </Badge>
        )}
        {agent.healthy === false && (
          <Badge dot variant="danger">
            Unhealthy
          </Badge>
        )}
        {agent.healthy == null && <Badge variant="neutral">No health reported</Badge>}
      </div>
      {agent.health != null && Object.keys(agent.health).length > 0 ? (
        <details>
          <summary className="cursor-pointer rounded text-xs text-ink-3 outline-none select-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/70">
            Raw health report
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[11px] leading-4 text-ink-2">
            {JSON.stringify(agent.health, null, 2)}
          </pre>
        </details>
      ) : (
        <p className="text-xs text-ink-3">The agent has not sent a component health report yet.</p>
      )}
    </Card>
  )
}

function DescriptionCard({ agent }: { agent: AgentDetail }) {
  const entries = Object.entries(agent.description ?? {})
  return (
    <Card title="Description">
      {entries.length === 0 ? (
        <p className="text-xs text-ink-3">The agent has not reported an AgentDescription yet.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-1.5 text-xs">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-ink-3">{key}</dt>
              <dd className="min-w-0">
                <code className="font-mono break-all text-ink-2">{stringifyAttr(value)}</code>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}

function stringifyAttr(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function AgentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-9 w-full" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}
