import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** A lucide icon component, e.g. `icon={Inbox}`. */
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  /** The next step, usually a Button or a Link styled with buttonVariants. */
  action?: ReactNode
  /** Smaller padding, for use inside cards and panels. */
  compact?: boolean
  /** Dashed border box (default) or no border. */
  bordered?: boolean
  className?: string
}

/** "Nothing here yet" with a clear next action. */
export function EmptyState({ icon: Icon, title, description, action, compact, bordered = true, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        bordered && 'rounded-lg border border-dashed border-border-strong',
        className,
      )}
    >
      {Icon ? (
        <span className="mb-1 inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface-2 text-muted">
          <Icon aria-hidden className="size-4" />
        </span>
      ) : null}
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}
