import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { PROJECT } from '@/lib/product'

export interface AuthShellProps {
  title: ReactNode
  description?: ReactNode
  /** Shows placeholders instead of the title and description (e.g. while the account status loads). */
  headingLoading?: boolean
  /** A notice between the heading and the form. */
  notice?: ReactNode
  /** The form. */
  children: ReactNode
  /** One line under the form, e.g. "No account yet? Create one". */
  footer?: ReactNode
}

/** Frame for /signin and /signup: wordmark and theme on top, one narrow centred column, project line at the bottom. */
export function AuthShell({ title, description, headingLoading, notice, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="Followup home" className="rounded-sm">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 justify-center px-4 pt-10 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm animate-fade-in">
          {headingLoading ? (
            <div className="space-y-3" role="status" aria-label="Loading">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              {description ? <p className="text-base text-muted">{description}</p> : null}
            </div>
          )}

          {notice ? <div className="mt-6">{notice}</div> : null}

          <div className="mt-8">{children}</div>

          {footer ? <p className="mt-8 text-center text-sm text-muted">{footer}</p> : null}
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-6 text-xs text-subtle">
        <span>{PROJECT.event}</span>
        <span aria-hidden>·</span>
        <span>Team {PROJECT.team}</span>
        <span aria-hidden>·</span>
        <span>Problem {PROJECT.problem}</span>
      </footer>
    </div>
  )
}
