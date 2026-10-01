import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Buttons on the right (they wrap below the title on small screens). */
  actions?: ReactNode
  /** Small line above the title, e.g. a back link. */
  eyebrow?: ReactNode
  /** Badges or meta shown inline after the title. */
  meta?: ReactNode
  className?: string
}

/** Page title block: the single <h1> of an app page. */
export function PageHeader({ title, description, actions, eyebrow, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-sm text-muted">{eyebrow}</div> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {meta}
        </div>
        {description ? <p className="max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
