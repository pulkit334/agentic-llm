import { RotateCw } from 'lucide-react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Wordmark } from '@/components/brand'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * Shown when a route fails to load or a page throws while rendering.
 * `embedded` renders inside the app layout (sidebar and top bar stay usable).
 */
export default function RouteError({ embedded = false }: { embedded?: boolean }) {
  const error = useRouteError()
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message)
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : chunkFailed
      ? 'A newer version of the app is available.'
      : error instanceof Error
        ? error.message
        : 'Unknown error'

  const Root = embedded ? 'div' : 'main'
  return (
    <Root
      role={embedded ? 'alert' : undefined}
      className={
        embedded
          ? 'flex flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-border-strong px-4 py-16 text-center'
          : 'flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 text-center'
      }
    >
      {embedded ? null : <Wordmark />}
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong on this page</h1>
        <p className="text-sm break-words text-muted">{message}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          <RotateCw aria-hidden />
          Reload
        </Button>
        <Link to="/app" reloadDocument className={buttonVariants({ variant: 'secondary' })}>
          Go to overview
        </Link>
      </div>
    </Root>
  )
}
