import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg">
      <Wordmark />
      <div className="text-center">
        <div className="font-mono text-sm text-ink-3">404</div>
        <div className="mt-1 text-[15px] font-semibold text-ink">This page does not exist</div>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
