import { formatRelative } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { PipelineVersionSummary } from '@/api/generated'

/**
 * Right-side version history. Selecting a version loads it read-only into
 * the preview panel (with diff-vs-draft and restore/activate actions there).
 */
export function VersionsSheet({
  open,
  onOpenChange,
  versions,
  selectedVersion,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions: PipelineVersionSummary[]
  selectedVersion: number | null
  onSelect: (version: number) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Versions"
        description="Newest first. Select one to inspect, diff, restore, or activate it."
      >
        {versions.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-ink-3">No versions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {versions.map((v) => (
              <li key={v.version}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(v.version)
                    onOpenChange(false)
                  }}
                  aria-current={selectedVersion === v.version ? 'true' : undefined}
                  className="flex w-full cursor-pointer flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/70 aria-[current]:border-line aria-[current]:bg-surface-2"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-ink">
                      v{v.version}
                    </span>
                    {v.validationStatus === 'valid' ? (
                      <Badge variant="ok">valid</Badge>
                    ) : (
                      <Badge variant="danger">invalid</Badge>
                    )}
                    {v.active && (
                      <Badge dot variant="accent">
                        active
                      </Badge>
                    )}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    {formatRelative(v.createdAt)}
                    {v.createdBy ? ` · ${v.createdBy}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  )
}
