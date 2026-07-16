import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileCode2 } from 'lucide-react'
import { getAgentConfigOptions } from '@/api/generated/@tanstack/react-query.gen'
import { DiffView } from '@/features/pipelines/diff-view'
import { YamlView } from '@/features/pipelines/yaml-view'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ErrorState } from '@/components/error-state'

/**
 * Assigned-vs-reported config comparison. The diff is the default lens
 * (drift is what an operator cares about); the raw toggle shows both YAML
 * documents in the read-only CodeMirror viewer.
 */
export function AgentConfigTab({ agentId }: { agentId: string }) {
  const [showRaw, setShowRaw] = useState(false)
  const configQuery = useQuery({
    ...getAgentConfigOptions({ path: { agentId } }),
    refetchInterval: 10_000,
  })

  if (configQuery.isPending) return <Skeleton className="h-72 w-full" />
  if (configQuery.isError) {
    return (
      <ErrorState title="Could not load the config" onRetry={() => void configQuery.refetch()} />
    )
  }

  const { assignedYaml, reportedYaml } = configQuery.data

  if (assignedYaml === '' && reportedYaml === '') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
        <FileCode2 className="size-5 text-ink-3" />
        <div className="text-sm font-semibold text-ink">No config reported yet</div>
        <p className="max-w-md text-[13px] text-ink-2">
          No config has been assigned to this agent and it has not reported an effective config.
          Activate an edge pipeline for its customer to push one.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 self-end text-xs text-ink-3">
        Raw YAML
        <Switch aria-label="Raw YAML" checked={showRaw} onCheckedChange={setShowRaw} />
      </label>
      {showRaw ? (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <RawPane label="assigned" yaml={assignedYaml} emptyText="No config assigned." />
          <RawPane label="reported" yaml={reportedYaml} emptyText="No config reported yet." />
        </div>
      ) : (
        <DiffView
          before={assignedYaml}
          after={reportedYaml}
          beforeLabel="assigned"
          afterLabel="reported"
          className="max-h-[70vh]"
        />
      )}
    </div>
  )
}

function RawPane({ label, yaml, emptyText }: { label: string; yaml: string; emptyText: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="font-mono text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
        {label}
      </h3>
      {yaml === '' ? (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
          {emptyText}
        </p>
      ) : (
        <YamlView value={yaml} className="max-h-[70vh]" />
      )}
    </section>
  )
}
