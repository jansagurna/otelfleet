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
import { cn } from '@/lib/utils'
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
import type { Pipeline } from '@/api/generated'

type TargetClass = Pipeline['targetClass']

const TARGET_CLASS_OPTIONS: { value: TargetClass; title: string; description: string }[] = [
  {
    value: 'forwarding',
    title: 'Central forwarding tier',
    description: 'Runs on the shared forwarding collectors, routed by tenant.id.',
  },
  {
    value: 'edge',
    title: 'Customer edge agents (OpAMP)',
    description: 'Rendered as a standalone config and pushed to the customer’s enrolled edge agents.',
  },
]

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
  const [targetClass, setTargetClass] = useState<TargetClass>('forwarding')
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
      setTargetClass('forwarding')
      onOpenChange(false)
      void navigate({ to: '/pipelines/$pipelineId', params: { pipelineId: pipeline.id } })
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name.trim() === '' || effectiveCustomer === '') return
    create.mutate({
      path: { customerId: effectiveCustomer },
      body: { name: name.trim(), targetClass, graph: defaultGraph(catalogQuery.data) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New pipeline</DialogTitle>
          <DialogDescription>
            Starts as a draft with logs → batch → debug. Edit the graph and activate a version to
            deploy it to its target tier.
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
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-ink-2">Runs on</legend>
            <div className="flex flex-col gap-1.5">
              {TARGET_CLASS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors',
                    targetClass === option.value
                      ? 'border-accent/60 bg-accent/5'
                      : 'border-line hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name="pipeline-target-class"
                    value={option.value}
                    checked={targetClass === option.value}
                    onChange={() => setTargetClass(option.value)}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-ink">{option.title}</span>
                    <span className="text-xs text-ink-3">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
