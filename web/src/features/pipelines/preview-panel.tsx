import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, CircleX, History, Loader2 } from 'lucide-react'
import { getPipelineVersionOptions } from '@/api/generated/@tanstack/react-query.gen'
import { validatePipeline } from '@/api/generated/sdk.gen'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useDraftStore } from '@/features/pipelines/draft-store'
import { parseErrorPath, flashAnchor } from '@/features/pipelines/error-path'
import { YamlView } from '@/features/pipelines/yaml-view'
import { DiffView } from '@/features/pipelines/diff-view'
import { formatRelative } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { toast } from '@/components/toaster'
import type { PipelineGraph, ValidationResult } from '@/api/generated'

type ValidationErrors = ValidationResult['errors']

/** Debounced live validation of the current draft graph. */
function useDraftValidation(graph: PipelineGraph) {
  const debounced = useDebouncedValue(graph, 600)
  const query = useQuery({
    queryKey: ['validatePipelineDraft', debounced],
    queryFn: async () => {
      const { data } = await validatePipeline({ body: { graph: debounced }, throwOnError: true })
      return data
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  })
  return { query, settling: graph !== debounced }
}

/**
 * Right pane of the editor. In draft mode it live-validates the draft and
 * previews the rendered YAML; selecting a version (from the versions sheet)
 * switches to a read-only view of that version with a diff-vs-draft toggle.
 */
export function PreviewPanel({
  pipelineId,
  selectedVersion,
  onClearSelection,
  onActivateVersion,
  canEdit,
  saveErrors,
}: {
  pipelineId: string
  selectedVersion: number | null
  onClearSelection: () => void
  onActivateVersion: (version: number) => void
  canEdit: boolean
  /** ValidationResult errors returned by a rejected save (HTTP 400). */
  saveErrors: ValidationErrors | null
}) {
  const graph = useDraftStore((s) => s.graph)
  const { query, settling } = useDraftValidation(graph)
  const draftYaml = query.data?.renderedYaml ?? null

  return (
    <section
      aria-label="Preview"
      className="flex min-w-0 flex-col rounded-lg border border-line bg-surface"
    >
      {selectedVersion === null ? (
        <DraftPreview
          validation={query.data}
          validating={settling || query.isFetching}
          unavailable={query.isError}
          onRetry={() => void query.refetch()}
          saveErrors={saveErrors}
        />
      ) : (
        <VersionPreview
          pipelineId={pipelineId}
          version={selectedVersion}
          draftYaml={draftYaml}
          onBack={onClearSelection}
          onActivate={onActivateVersion}
          canEdit={canEdit}
        />
      )}
    </section>
  )
}

function DraftPreview({
  validation,
  validating,
  unavailable,
  onRetry,
  saveErrors,
}: {
  validation: ValidationResult | undefined
  validating: boolean
  unavailable: boolean
  onRetry: () => void
  saveErrors: ValidationErrors | null
}) {
  const errors: ValidationErrors = [
    ...(saveErrors ?? []),
    ...(validation && !validation.valid ? validation.errors : []),
  ]

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-[13px] font-semibold text-ink">Draft preview</h3>
        <span className="ml-auto">
          {validating ? (
            <Badge variant="neutral">
              <Loader2 aria-hidden className="size-3 animate-spin" />
              Validating…
            </Badge>
          ) : unavailable ? (
            <Badge variant="warn">validation unavailable</Badge>
          ) : validation?.valid ? (
            <Badge variant="ok">
              <CircleCheck aria-hidden className="size-3" />
              Valid
            </Badge>
          ) : validation ? (
            <Badge variant="danger">
              <CircleX aria-hidden className="size-3" />
              {validation.errors.length} error{validation.errors.length === 1 ? '' : 's'}
            </Badge>
          ) : null}
        </span>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {unavailable && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-ink-2"
          >
            <span>
              Validation is unavailable — the API could not be reached or the endpoint is not
              deployed yet. The draft is kept locally; you can keep editing.
            </span>
            <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}

        {errors.length > 0 && <ErrorList errors={errors} />}

        {validation?.renderedYaml ? (
          <YamlView value={validation.renderedYaml} className="max-h-[60vh]" />
        ) : !unavailable ? (
          validation ? (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
              No rendered config — fix the errors above to see the collector YAML.
            </p>
          ) : (
            <Skeleton className="h-40 w-full" />
          )
        ) : null}
      </div>
    </>
  )
}

/** Validation errors; entries with a path scroll to and flash their card. */
function ErrorList({ errors }: { errors: ValidationErrors }) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Validation errors">
      {errors.map((error, i) => {
        const anchor = parseErrorPath(error.path)
        return (
          <li
            key={i}
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-ink"
          >
            <span>{error.message}</span>
            {error.path &&
              (anchor ? (
                <button
                  type="button"
                  onClick={() => flashAnchor(anchor)}
                  className="mt-1 block cursor-pointer rounded font-mono text-[11px] text-danger underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-danger/60"
                >
                  {error.path}
                </button>
              ) : (
                <code className="mt-1 block font-mono text-[11px] text-ink-3">{error.path}</code>
              ))}
          </li>
        )
      })}
    </ul>
  )
}

function VersionPreview({
  pipelineId,
  version,
  draftYaml,
  onBack,
  onActivate,
  canEdit,
}: {
  pipelineId: string
  version: number
  draftYaml: string | null
  onBack: () => void
  onActivate: (version: number) => void
  canEdit: boolean
}) {
  const [showDiff, setShowDiff] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const dirty = useDraftStore((s) => s.dirty)
  const replaceGraph = useDraftStore((s) => s.replaceGraph)

  const versionQuery = useQuery(
    getPipelineVersionOptions({ path: { pipelineId, version } }),
  )
  const data = versionQuery.data

  const restore = () => {
    if (!data) return
    replaceGraph(data.graph)
    toast(`Version ${version} restored as draft`)
    setConfirmRestore(false)
    onBack()
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex cursor-pointer items-center gap-1 rounded text-xs text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <ArrowLeft className="size-3" />
          Draft
        </button>
        <h3 className="font-mono text-[13px] font-semibold text-ink">v{version}</h3>
        {data && (
          <>
            {data.validationStatus === 'valid' ? (
              <Badge variant="ok">valid</Badge>
            ) : (
              <Badge variant="danger">invalid</Badge>
            )}
            {data.active && (
              <Badge dot variant="accent">
                active
              </Badge>
            )}
          </>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-3">
          Diff vs draft
          <Switch
            aria-label="Diff vs draft"
            checked={showDiff}
            onCheckedChange={setShowDiff}
            disabled={draftYaml === null}
          />
        </span>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {versionQuery.isPending && <Skeleton className="h-40 w-full" />}
        {versionQuery.isError && (
          <div role="alert" className="text-xs text-danger">
            Could not load version {version}.{' '}
            <button
              type="button"
              className="cursor-pointer underline underline-offset-2"
              onClick={() => void versionQuery.refetch()}
            >
              Retry
            </button>
          </div>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
              <span>
                created {formatRelative(data.createdAt)}
                {data.createdBy ? ` by ${data.createdBy}` : ''}
              </span>
              <code className="font-mono">{data.configHash.slice(0, 12)}</code>
            </div>
            {showDiff && draftYaml !== null ? (
              <DiffView
                before={data.renderedYaml}
                after={draftYaml}
                beforeLabel={`v${version}`}
                afterLabel="draft"
                className="max-h-[60vh]"
              />
            ) : (
              <YamlView value={data.renderedYaml} className="max-h-[60vh]" />
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (dirty ? setConfirmRestore(true) : restore())}
                >
                  <History aria-hidden />
                  Restore as draft
                </Button>
                {data.validationStatus === 'valid' && !data.active && (
                  <Button variant="primary" size="sm" onClick={() => onActivate(version)}>
                    Activate this version
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title={`Restore v${version} as draft?`}
        description="Your current draft has unsaved changes that will be replaced by this version's graph."
        confirmLabel="Replace draft"
        destructive
        onConfirm={restore}
      />
    </>
  )
}
