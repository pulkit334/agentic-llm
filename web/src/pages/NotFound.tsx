import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/brand'
import { buttonVariants } from '@/components/ui/button'
import { useDocumentTitle } from '@/components/layout/page-title'

/** 404 for any unknown URL. */
export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Link to="/" aria-label="Followup home" className="rounded-sm">
        <Wordmark />
      </Link>
      <div className="space-y-2">
        <p className="font-mono text-xs text-subtle">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="text-sm text-muted">The link may be old, or the conversation was removed when the demo was reset.</p>
      </div>
      <Link to="/app" className={buttonVariants({ variant: 'secondary' })}>
        <ArrowLeft aria-hidden />
        Back to the app
      </Link>
    </main>
  )
}
