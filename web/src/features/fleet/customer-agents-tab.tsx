import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Ship, Ticket } from 'lucide-react'
import {
  listAgentsOptions,
  listBootstrapTokensOptions,
  listBootstrapTokensQueryKey,
  revokeBootstrapTokenMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { agentDisplayName } from '@/features/fleet/agent-status'
import { formatTokenUses } from '@/features/fleet/enrollment'
import { AgentClassBadge, ConfigChip, StatusDot } from '@/features/fleet/badges'
import { CreateBootstrapTokenDialog } from '@/features/fleet/create-bootstrap-token-dialog'
import { TokenSecretDialog } from '@/features/fleet/token-secret-dialog'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { useMe, canMutate } from '@/hooks/use-me'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorState } from '@/components/error-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { BootstrapToken, BootstrapTokenCreated } from '@/api/generated'

/** Customer "Agents" tab: bootstrap tokens on top, enrolled agents below. */
export function CustomerAgentsTab({ customerId }: { customerId: string }) {
  return (
    <div className="flex flex-col gap-8">
      <BootstrapTokensSection customerId={customerId} />
      <CustomerAgentsSection customerId={customerId} />
    </div>
  )
}

// ---- bootstrap tokens ------------------------------------------------------

function BootstrapTokensSection({ customerId }: { customerId: string }) {
  const me = useMe()
  const [createOpen, setCreateOpen] = useState(false)
  const [createdToken, setCreatedToken] = useState<BootstrapTokenCreated | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<BootstrapToken | null>(null)
  const queryClient = useQueryClient()

  const tokensQuery = useQuery(listBootstrapTokensOptions({ path: { customerId } }))

  const revoke = useMutation({
    ...revokeBootstrapTokenMutation(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listBootstrapTokensQueryKey({ path: { customerId } }),
      })
      setRevokeTarget(null)
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">Bootstrap tokens</h2>
        {canMutate(me) && (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            Create token
          </Button>
        )}
      </div>

      {tokensQuery.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
      {tokensQuery.isError && (
        <ErrorState
          title="Could not load bootstrap tokens"
          onRetry={() => void tokensQuery.refetch()}
        />
      )}
      {tokensQuery.isSuccess &&
        (tokensQuery.data.tokens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
            <Ticket className="size-5 text-ink-3" />
            <div className="text-sm font-semibold text-ink">No bootstrap tokens</div>
            <p className="max-w-md text-[13px] text-ink-2">
              Edge agents need a bootstrap token to enroll for this customer.
              {canMutate(me) ? ' Create one to onboard the first agent.' : ''}
            </p>
          </div>
        ) : (
          <BootstrapTokensTable
            tokens={tokensQuery.data.tokens}
            canRevoke={canMutate(me)}
            onRevoke={setRevokeTarget}
          />
        ))}

      <CreateBootstrapTokenDialog
        customerId={customerId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setCreatedToken}
      />
      <TokenSecretDialog token={createdToken} onClose={() => setCreatedToken(null)} />
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title={`Revoke ${revokeTarget?.name ?? 'this token'}?`}
        description="Revocation is permanent. Agents that already enrolled with it stay enrolled; the token just stops accepting new enrollments."
        confirmLabel="Revoke token"
        destructive
        pending={revoke.isPending}
        onConfirm={() => {
          if (revokeTarget) {
            revoke.mutate({ path: { customerId, tokenId: revokeTarget.id } })
          }
        }}
      />
    </div>
  )
}

function tokenState(token: BootstrapToken): 'revoked' | 'expired' | 'exhausted' | 'active' {
  if (token.revokedAt) return 'revoked'
  if (new Date(token.expiresAt).getTime() < Date.now()) return 'expired'
  if (token.maxUses > 0 && token.usedCount >= token.maxUses) return 'exhausted'
  return 'active'
}

function BootstrapTokensTable({
  tokens,
  canRevoke,
  onRevoke,
}: {
  tokens: BootstrapToken[]
  canRevoke: boolean
  onRevoke: (token: BootstrapToken) => void
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Token prefix</TableHead>
            <TableHead>Uses</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Status</TableHead>
            {canRevoke && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((token) => {
            const state = tokenState(token)
            return (
              <TableRow key={token.id} className={cn(state === 'revoked' && 'opacity-60')}>
                <TableCell className="font-medium text-ink">{token.name}</TableCell>
                <TableCell>
                  <code className="font-mono text-xs text-ink-2">{token.tokenPrefix}</code>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-ink-2 tabular-nums">
                    {formatTokenUses(token.usedCount, token.maxUses)}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-ink-2" title={formatDateTime(token.expiresAt)}>
                  {formatDate(token.expiresAt)}
                </TableCell>
                <TableCell>
                  {state === 'revoked' && (
                    <Badge dot variant="danger">
                      Revoked
                    </Badge>
                  )}
                  {state === 'expired' && (
                    <Badge dot variant="warn">
                      Expired
                    </Badge>
                  )}
                  {state === 'exhausted' && (
                    <Badge dot variant="neutral">
                      Used up
                    </Badge>
                  )}
                  {state === 'active' && (
                    <Badge dot variant="ok">
                      Active
                    </Badge>
                  )}
                </TableCell>
                {canRevoke && (
                  <TableCell className="text-right">
                    {state !== 'revoked' && (
                      <Button variant="danger" size="sm" onClick={() => onRevoke(token)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}

// ---- enrolled agents -------------------------------------------------------

function CustomerAgentsSection({ customerId }: { customerId: string }) {
  const agentsQuery = useQuery({
    ...listAgentsOptions({ query: { customerId } }),
    refetchInterval: 10_000,
  })

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[13px] font-semibold text-ink">Edge agents</h2>

      {agentsQuery.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}
      {agentsQuery.isError && (
        <ErrorState title="Could not load agents" onRetry={() => void agentsQuery.refetch()} />
      )}
      {agentsQuery.isSuccess &&
        (agentsQuery.data.agents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-8 text-center">
            <Ship className="size-5 text-ink-3" />
            <div className="text-sm font-semibold text-ink">No agents enrolled</div>
            <p className="max-w-md text-[13px] text-ink-2">
              Create a bootstrap token above and start an edge agent with it — it appears here as
              soon as it connects.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {agentsQuery.data.agents.map((agent) => (
              <li key={agent.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <StatusDot agent={agent} />
                <Link
                  to="/fleet/$agentId"
                  params={{ agentId: agent.id }}
                  className="rounded font-mono text-xs font-medium text-ink outline-none hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {agentDisplayName(agent)}
                </Link>
                <AgentClassBadge agentClass={agent.class} />
                <ConfigChip agent={agent} />
                <span className="ml-auto flex items-center gap-4 text-[11px] text-ink-3">
                  <span className="font-mono">{agent.agentVersion ?? '—'}</span>
                  <span
                    className="tabular-nums"
                    title={
                      agent.lastSeenAt != null ? formatDateTime(agent.lastSeenAt) : undefined
                    }
                  >
                    {agent.lastSeenAt != null ? formatRelative(agent.lastSeenAt) : 'never seen'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
