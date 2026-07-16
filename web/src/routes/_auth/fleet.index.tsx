import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  listAgentsOptions,
  listCustomersOptions,
} from '@/api/generated/@tanstack/react-query.gen'
import { ENROLLMENT_COMMAND_PLACEHOLDER } from '@/features/fleet/enrollment'
import { AgentsTable } from '@/features/fleet/agents-table'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import { TerminalHint } from '@/components/terminal-hint'
import type { AgentClass } from '@/api/generated'

type ConnFilter = 'online' | 'offline'

interface FleetSearch {
  class?: AgentClass
  customer?: string
  conn?: ConnFilter
}

export const Route = createFileRoute('/_auth/fleet/')({
  validateSearch: (search: Record<string, unknown>): FleetSearch => ({
    class: search.class === 'gateway' || search.class === 'edge' ? search.class : undefined,
    customer:
      typeof search.customer === 'string' && search.customer !== '' ? search.customer : undefined,
    conn: search.conn === 'online' || search.conn === 'offline' ? search.conn : undefined,
  }),
  component: FleetPage,
})

function FleetPage() {
  const { class: classFilter, customer, conn } = Route.useSearch()
  const navigate = Route.useNavigate()

  const agentsQuery = useQuery({
    ...listAgentsOptions({
      query: {
        ...(classFilter !== undefined ? { class: classFilter } : {}),
        ...(customer !== undefined ? { customerId: customer } : {}),
        ...(conn !== undefined ? { connected: conn === 'online' } : {}),
      },
    }),
    refetchInterval: 10_000,
  })

  const filtered = classFilter !== undefined || customer !== undefined || conn !== undefined

  const setFilter = (patch: Partial<FleetSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Fleet</h1>
        <p className="text-[13px] text-ink-2">
          Every collector this control plane manages over OpAMP — gateways and customer edge
          agents.
        </p>
      </div>

      <FilterBar
        classFilter={classFilter}
        customer={customer}
        conn={conn}
        onChange={setFilter}
      />

      {agentsQuery.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
      {agentsQuery.isError && (
        <ErrorState title="Could not load agents" onRetry={() => void agentsQuery.refetch()} />
      )}
      {agentsQuery.isSuccess &&
        (agentsQuery.data.agents.length === 0 ? (
          filtered ? (
            <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
              No agents match the filters.
            </div>
          ) : (
            <TerminalHint
              title="No agents in the fleet yet"
              body="Gateway collectors register themselves over OpAMP. To enroll a customer edge agent, create a bootstrap token on the customer's Agents tab and start the agent with it:"
              command={ENROLLMENT_COMMAND_PLACEHOLDER}
            />
          )
        ) : (
          <AgentsTable agents={agentsQuery.data.agents} />
        ))}
    </div>
  )
}

function FilterBar({
  classFilter,
  customer,
  conn,
  onChange,
}: {
  classFilter?: AgentClass
  customer?: string
  conn?: ConnFilter
  onChange: (patch: Partial<FleetSearch>) => void
}) {
  const customersQuery = useQuery(listCustomersOptions())

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fleet-class">Class</Label>
        <Select
          id="fleet-class"
          className="w-36"
          value={classFilter ?? ''}
          onChange={(e) =>
            onChange({
              class: e.target.value === '' ? undefined : (e.target.value as AgentClass),
            })
          }
        >
          <option value="">All classes</option>
          <option value="gateway">gateway</option>
          <option value="edge">edge</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fleet-customer">Customer</Label>
        <Select
          id="fleet-customer"
          className="w-48"
          value={customer ?? ''}
          onChange={(e) => onChange({ customer: e.target.value === '' ? undefined : e.target.value })}
        >
          <option value="">All customers</option>
          {(customersQuery.data?.customers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fleet-conn">Connection</Label>
        <Select
          id="fleet-conn"
          className="w-36"
          value={conn ?? ''}
          onChange={(e) =>
            onChange({ conn: e.target.value === '' ? undefined : (e.target.value as ConnFilter) })
          }
        >
          <option value="">All states</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </Select>
      </div>
    </div>
  )
}
