import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

export interface StatTileProps {
  label: ReactNode
  value: ReactNode
  /** One short line under the value, e.g. "2 due in the next day". */
  hint?: ReactNode
  icon?: LucideIcon
  /** Makes the whole tile a link. */
  to?: string
  loading?: boolean
  className?: string
}

/** A single number with its label (Overview). */
export function StatTile({ label, value, hint, icon: Icon, to, loading, className }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        {Icon ? <Icon aria-hidden className="size-4 text-subtle" /> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-14" />
      ) : (
        <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</div>
      )}
      {/* While loading, the hint line is always reserved so the tile keeps its height. */}
      {loading ? (
        <div className="mt-1 flex h-4 items-center">
          <Skeleton className="h-3 w-24" />
        </div>
      ) : hint ? (
        <div className="mt-1 truncate text-xs text-muted">{hint}</div>
      ) : null}
    </>
  )
  const classes = cn('block rounded-lg border border-border bg-surface p-4', className)
  if (to) {
    return (
      <Link to={to} className={cn(classes, 'transition-colors duration-150 hover:border-border-strong hover:bg-surface-2')}>
        {body}
      </Link>
    )
  }
  return <div className={classes}>{body}</div>
}
