import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCustomerMutation,
  listCustomersQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import { deriveSlug, isValidSlug } from '@/lib/slug'
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
import type { ApiKeyCreated, Customer } from '@/api/generated'

export function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (customer: Customer, initialApiKey: ApiKeyCreated) => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const queryClient = useQueryClient()

  const derived = deriveSlug(name)
  const effectiveSlug = slug.trim() === '' ? derived : slug.trim()
  const slugInvalid = effectiveSlug !== '' && !isValidSlug(effectiveSlug)

  const create = useMutation({
    ...createCustomerMutation(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: listCustomersQueryKey() })
      setName('')
      setSlug('')
      onOpenChange(false)
      onCreated(data.customer, data.initialApiKey)
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name.trim() === '' || slugInvalid) return
    create.mutate({
      body: {
        name: name.trim(),
        ...(slug.trim() !== '' ? { slug: slug.trim() } : {}),
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Creates the tenant, a client ID, and an initial API key for OTLP ingest.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-name">Name</Label>
            <Input
              id="customer-name"
              required
              maxLength={200}
              placeholder="ACME Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-slug">
              Slug <span className="font-normal text-ink-3">(optional)</span>
            </Label>
            <Input
              id="customer-slug"
              placeholder={derived === '' ? 'acme-corp' : derived}
              value={slug}
              spellCheck={false}
              onChange={(e) => setSlug(e.target.value)}
              aria-invalid={slugInvalid}
            />
            {slugInvalid ? (
              <p role="alert" className="text-xs text-danger">
                Slugs are 3–64 lowercase letters, digits, and hyphens, starting and ending with a
                letter or digit.
              </p>
            ) : (
              <p className="text-xs text-ink-3">
                Will be created as{' '}
                <code data-testid="slug-preview" className="font-mono text-ink-2">
                  {effectiveSlug === '' ? '—' : effectiveSlug}
                </code>
              </p>
            )}
          </div>
          {create.isError && (
            <p role="alert" className="text-xs text-danger">
              Could not create the customer — the slug may already exist.
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
              disabled={create.isPending || name.trim() === '' || slugInvalid}
            >
              {create.isPending ? 'Creating…' : 'Create customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
