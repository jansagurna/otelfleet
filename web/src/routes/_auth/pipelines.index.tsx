import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { listPipelinesOptions } from '@/api/generated/@tanstack/react-query.gen'
import { useMe, canMutate } from '@/hooks/use-me'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import { PipelinesTable } from '@/features/pipelines/pipelines-table'
import { NewPipelineDialog } from '@/features/pipelines/new-pipeline-dialog'

export const Route = createFileRoute('/_auth/pipelines/')({
  component: PipelinesPage,
})

function PipelinesPage() {
  const me = useMe()
  const pipelinesQuery = useQuery(listPipelinesOptions())
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const pipelines = pipelinesQuery.data?.pipelines

  const filtered = useMemo(() => {
    if (!pipelines) return []
    const q = search.trim().toLowerCase()
    if (q === '') return pipelines
    return pipelines.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.customerName ?? '').toLowerCase().includes(q),
    )
  }, [pipelines, search])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Pipelines</h1>
          <p className="text-[13px] text-ink-2">
            Per-customer processing graphs deployed to the forwarding collector tier.
          </p>
        </div>
        {canMutate(me) && (
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden />
            New pipeline
          </Button>
        )}
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
        <Input
          type="search"
          placeholder="Search name or customer"
          aria-label="Search pipelines"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {pipelinesQuery.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
      {pipelinesQuery.isError && (
        <ErrorState
          title="Could not load pipelines"
          onRetry={() => void pipelinesQuery.refetch()}
        />
      )}
      {pipelinesQuery.isSuccess &&
        (search.trim() !== '' && filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
            No pipelines match the search.
          </div>
        ) : (
          <PipelinesTable
            pipelines={filtered}
            showCustomer
            emptyHint="Create the first pipeline to route a customer's telemetry through processors into an export destination."
          />
        ))}

      <NewPipelineDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
