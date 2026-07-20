import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listCustomersOptions,
  listUsersQueryKey,
  updateUserMutation,
} from '@/api/generated/@tanstack/react-query.gen'
import { apiErrorMessage } from '@/lib/api-error'
import { toast } from '@/components/toaster'
import { CustomerMultiSelect } from '@/features/settings/customer-multi-select'
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
import type { UserAccount } from '@/api/generated'

/**
 * Edits a non-admin user's tenant-scope grants. Sending `customerIds: []`
 * clears the grants (→ all customers); a non-empty array replaces them.
 */
export function EditAccessDialog({
  user,
  onClose,
}: {
  user: UserAccount | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        {user && <EditAccessForm key={user.id} user={user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function EditAccessForm({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [customerIds, setCustomerIds] = useState<string[]>(user.customerIds ?? [])

  const customersQuery = useQuery(listCustomersOptions())

  const update = useMutation({
    ...updateUserMutation(),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: listUsersQueryKey() })
      onClose()
      toast(`${updated.email} updated`)
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    update.mutate({ path: { userId: user.id }, body: { customerIds } })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Customer access</DialogTitle>
        <DialogDescription>
          Choose which customers <span className="font-mono text-ink">{user.email}</span> can act
          on. Leave empty for access to all customers.
        </DialogDescription>
      </DialogHeader>

      <CustomerMultiSelect
        namePrefix="edit-access"
        customers={customersQuery.data?.customers ?? []}
        selected={customerIds}
        onChange={setCustomerIds}
        disabled={update.isPending}
        isLoading={customersQuery.isPending}
        isError={customersQuery.isError}
      />

      {update.isError && (
        <p role="alert" className="text-xs text-danger">
          {apiErrorMessage(update.error, 'Could not update customer access.')}
        </p>
      )}

      <DialogFooter className="mt-1">
        <DialogClose asChild>
          <Button variant="ghost" disabled={update.isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save access'}
        </Button>
      </DialogFooter>
    </form>
  )
}
