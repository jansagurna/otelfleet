import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPipelineMutation,
  getComponentCatalogOptions,
  listCustomerPipelinesQueryKey,
  listCustomersOptions,
  listPipelinesQueryKey,
} from '@/api/generated/@tanstack/react-query.gen'
import { defaultGraph } from '@/features/pipelines/graph'
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
import { Select } from '@/components/ui/select'

/**
 * Creates a pipeline with the minimal default graph (logs → batch → debug)
 * and jumps straight into its editor. When opened from a customer page the
 * customer is preselected and locked.
 */
export function NewPipelineDialog({
  open,
  onOpenChange,
  customerId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselects and locks the customer (customer-detail flow). */
  customerId?: string
}) {
  const [name, setName] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const customersQuery = useQuery({ ...listCustomersOptions(), enabled: open && !customerId })
  const catalogQuery = useQuery({ ...getComponentCatalogOptions(), enabled: open })

  const effectiveCustomer = customerId ?? selectedCustomer

  const create = useMutation({
    ...createPipelineMutation(),
    onSuccess: (pipeline) => {
      void queryClient.invalidateQueries({ queryKey: listPipelinesQueryKey() })
      void queryClient.invalidateQueries({
        queryKey: listCustomerPipelinesQueryKey({ path: { customerId: pipeline.customerId } }),
      })
      setName('')
      setSelectedCustomer('')
      onOpenChange(false)
      void navigate({ to: '/pipelines/$pipelineId', params: { pipelineId: pipeline.id } })
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name.trim() === '' || effectiveCustomer === '') return
    create.mutate({
      path: { customerId: effectiveCustomer },
      body: { name: name.trim(), graph: defaultGraph(catalogQuery.data) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New pipeline</DialogTitle>
          <DialogDescription>
            Starts as a draft with logs → batch → debug. Edit the graph and activate a version to
            deploy it to the forwarding tier.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {!customerId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pipeline-customer">Customer</Label>
              <Select
                id="pipeline-customer"
                required
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
              >
                <option value="" disabled>
                  {customersQuery.isPending ? 'Loading customers…' : 'Select a customer'}
                </option>
                {(customersQuery.data?.customers ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
              {customersQuery.isError && (
                <p role="alert" className="text-xs text-danger">
                  Could not load customers.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pipeline-name">Name</Label>
            <Input
              id="pipeline-name"
              required
              maxLength={200}
              placeholder="prod-logs-to-loki"
              value={name}
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {create.isError && (
            <p role="alert" className="text-xs text-danger">
              Could not create the pipeline — the name may already exist for this customer.
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
              disabled={create.isPending || name.trim() === '' || effectiveCustomer === ''}
            >
              {create.isPending ? 'Creating…' : 'Create pipeline'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
