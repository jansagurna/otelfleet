import { Link } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { useMe, isAdmin } from '@/hooks/use-me'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'

/**
 * Render-level guard for admin-only pages. The nav already hides these
 * entries for non-admins; this covers direct URL access with a clean
 * denied page instead of a wall of 403 errors.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const me = useMe()
  // The /_auth beforeLoad guard has primed this query; me is only briefly
  // undefined during logout transitions.
  if (me === undefined) return null
  if (!isAdmin(me)) return <AdminRequired />
  return <>{children}</>
}

function AdminRequired() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-16 text-center">
      <ShieldAlert aria-hidden className="size-6 text-ink-3" />
      <div className="text-sm font-semibold text-ink">This page requires the admin role</div>
      <p className="max-w-md text-[13px] text-ink-2">
        Settings and the audit log are limited to administrators. Ask an admin to change your role
        if you need access.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
