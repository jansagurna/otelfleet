import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createBootstrapTokenMutation,
  listBootstrapTokensQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BootstrapTokenCreated } from '@/api/generated'

/** Mirrors CreateApiKeyDialog: name + optional expiry, plus optional max uses. */
export function CreateBootstrapTokenDialog({
  customerId,
  open,
  onOpenChange,
  onCreated,
}: {
  customerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (token: BootstrapTokenCreated) => void
}) {
  const [name, setName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const queryClient = useQueryClient()

  const create = useMutation({
    ...createBootstrapTokenMutation(),
    onSuccess: (token) => {
      void queryClient.invalidateQueries({
        queryKey: listBootstrapTokensQueryKey({ path: { customerId } }),
      })
      setName('')
      setExpiresAt('')
      setMaxUses('')
      onOpenChange(false)
      onCreated(token)
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name.trim() === '') return
    const uses = maxUses.trim() === '' ? undefined : Number(maxUses)
    create.mutate({
      path: { customerId },
      body: {
        name: name.trim(),
        ...(expiresAt !== '' ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        ...(uses !== undefined && Number.isFinite(uses) && uses > 0 ? { maxUses: uses } : {}),
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create bootstrap token</DialogTitle>
          <DialogDescription>
            Edge agents present this token once to enroll for the customer. The full token is shown
            exactly once after creation — only a hash is stored.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              required
              maxLength={200}
              placeholder="factory-floor"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="token-expiry">
              Expires <span className="font-normal text-ink-3">(optional)</span>
            </Label>
            <Input
              id="token-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-ink-3">Leave empty to expire in 30 days.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="token-max-uses">
              Max uses <span className="font-normal text-ink-3">(optional)</span>
            </Label>
            <Input
              id="token-max-uses"
              type="number"
              min={1}
              step={1}
              placeholder="unlimited"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
            <p className="text-xs text-ink-3">
              How many agents may enroll with it. Leave empty for unlimited.
            </p>
          </div>
          {create.isError && (
            <p role="alert" className="text-xs text-danger">
              Could not create the token. Retry, or check your role.
            </p>
          )}
          <DialogFooter className="mt-1">
            <DialogClose asChild>
              <Button variant="ghost" disabled={create.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="primary"
              disabled={create.isPending || name.trim() === ''}
            >
              {create.isPending ? 'Creating…' : 'Create token'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
