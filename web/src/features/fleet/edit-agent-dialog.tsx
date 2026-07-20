import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import {
  getAgentQueryKey,
  listAgentsQueryKey,
  updateAgentMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { apiErrorMessage } from '@/lib/api-error'
import { agentReportedName } from '@/features/fleet/agent-status'
import { toast } from '@/components/toaster'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Agent } from '@/api/generated'

interface LabelRow {
  key: string
  value: string
}

/** Edit an agent's operator metadata: friendly display name and labels. */
export function EditAgentDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [rows, setRows] = useState<LabelRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // Seed the form from the agent whenever the dialog (re-)opens.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (open && seededFor !== agent.id) {
    setDisplayName(agent.displayName ?? '')
    setRows(Object.entries(agent.labels ?? {}).map(([key, value]) => ({ key, value })))
    setError(null)
    setSeededFor(agent.id)
  }
  if (!open && seededFor !== null) setSeededFor(null)

  const update = useMutation({
    ...updateAgentMutation(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getAgentQueryKey({ path: { agentId: agent.id } }),
      })
      void queryClient.invalidateQueries({ queryKey: listAgentsQueryKey() })
      toast('Agent updated')
      onOpenChange(false)
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not update the agent')),
  })

  const addRow = () => setRows((prev) => [...prev, { key: '', value: '' }])
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))
  const setRow = (index: number, patch: Partial<LabelRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const submit = () => {
    setError(null)
    const labels: Record<string, string> = {}
    for (const row of rows) {
      const key = row.key.trim()
      if (key === '') continue
      if (key in labels) {
        setError(`Duplicate label key "${key}".`)
        return
      }
      labels[key] = row.value
    }
    const name = displayName.trim()
    update.mutate({
      path: { agentId: agent.id },
      body: { displayName: name === '' ? null : name, labels },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit agent</DialogTitle>
          <DialogDescription>
            Operator metadata only. The display name overrides the reported name in the console;
            labels are for grouping and filtering.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-display-name">Display name</Label>
            <Input
              id="agent-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={agentReportedName(agent)}
            />
            <p className="text-[11px] text-ink-3">
              Leave blank to fall back to the reported name.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Labels</Label>
            {rows.length === 0 ? (
              <p className="text-[11px] text-ink-3">No labels.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <Input
                      aria-label={`Label ${index + 1} key`}
                      className="font-mono"
                      placeholder="key"
                      value={row.key}
                      onChange={(e) => setRow(index, { key: e.target.value })}
                    />
                    <Input
                      aria-label={`Label ${index + 1} value`}
                      className="font-mono"
                      placeholder="value"
                      value={row.value}
                      onChange={(e) => setRow(index, { value: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 hover:text-danger"
                      aria-label={`Remove label ${index + 1}`}
                      onClick={() => removeRow(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" className="w-fit" onClick={addRow}>
              <Plus aria-hidden />
              Add label
            </Button>
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
