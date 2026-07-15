import { Badge } from '@/components/ui/badge'
import type { Customer } from '@/api/generated'

const STATUS_VARIANT: Record<Customer['status'], 'ok' | 'warn' | 'neutral'> = {
  active: 'ok',
  suspended: 'warn',
  deleted: 'neutral',
}

const STATUS_LABEL: Record<Customer['status'], string> = {
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
}

export function StatusBadge({ status }: { status: Customer['status'] }) {
  return (
    <Badge dot variant={STATUS_VARIANT[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
