import { agentStatus, configChip, type StatusTone } from '@/features/fleet/agent-status'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Agent, AgentClass } from '@/api/generated'

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  off: 'bg-ink-3',
}

/** Connection/health dot with a tooltip; add `showLabel` for headers. */
export function StatusDot({
  agent,
  showLabel = false,
  className,
}: {
  agent: Pick<Agent, 'connected' | 'healthy' | 'remoteConfigStatus'>
  showLabel?: boolean
  className?: string
}) {
  const status = agentStatus(agent)
  return (
    <span
      title={status.label}
      className={cn('inline-flex items-center gap-1.5 text-xs text-ink-2', className)}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_CLASS[status.tone])} />
      {showLabel ? status.label : <span className="sr-only">{status.label}</span>}
    </span>
  )
}

/** "in sync" / "out of sync" / "applying" / "failed" / "—" config chip. */
export function ConfigChip({
  agent,
}: {
  agent: Pick<Agent, 'remoteConfigStatus' | 'remoteConfigError' | 'configInSync'>
}) {
  const chip = configChip(agent)
  return (
    <Badge variant={chip.variant} title={chip.tooltip} className="font-mono">
      {chip.label}
    </Badge>
  )
}

/** gateway / edge agent class chip. */
export function AgentClassBadge({ agentClass }: { agentClass: AgentClass }) {
  return <Badge className="font-mono">{agentClass}</Badge>
}

/** Compact key=value chips for operator-set labels; renders nothing when empty. */
export function LabelChips({
  labels,
  className,
}: {
  labels?: Pick<Agent, 'labels'>['labels']
  className?: string
}) {
  const entries = Object.entries(labels ?? {})
  if (entries.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {entries.map(([key, value]) => (
        <Badge key={key} className="font-mono text-[10px]" title={`${key}=${value}`}>
          {key}={value}
        </Badge>
      ))}
    </div>
  )
}
