import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createApiKeyMutation,
  listApiKeysQueryKey,
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
import type { ApiKeyCreated } from '@/api/generated'

export function CreateApiKeyDialog({
  customerId,
  open,
  onOpenChange,
  onCreated,
}: {
  customerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: ApiKeyCreated) => void
}) {
  const [name, setName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const queryClient = useQueryClient()

  const create = useMutation({
    ...createApiKeyMutation(),
    onSuccess: (key) => {
      void queryClient.invalidateQueries({
        queryKey: listApiKeysQueryKey({ path: { customerId } }),
      })
      setName('')
      setExpiresAt('')
      onOpenChange(false)
      onCreated(key)
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name.trim() === '') return
    create.mutate({
      path: { customerId },
      body: {
        name: name.trim(),
        ...(expiresAt !== '' ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            The full key is shown exactly once after creation — only a hash is stored.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              required
              maxLength={200}
              placeholder="prod-gateway"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-expiry">
              Expires <span className="font-normal text-ink-3">(optional)</span>
            </Label>
            <Input
              id="key-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-ink-3">Leave empty for a non-expiring key.</p>
          </div>
          {create.isError && (
            <p role="alert" className="text-xs text-danger">
              Could not create the key. Retry, or check your role.
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
              {create.isPending ? 'Creating…' : 'Create key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
