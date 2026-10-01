import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { errorMessage } from '@/lib/api'
import type { Tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from './button'

const toneClasses: Record<Tone, string> = {
  neutral: 'border-border bg-surface',
  info: 'border-info/25 bg-info/5',
  success: 'border-success/25 bg-success/5',
  warning: 'border-warning/25 bg-warning/5',
  danger: 'border-danger/25 bg-danger/5',
}

const toneIcons: Record<Tone, ReactNode> = {
  neutral: <Info aria-hidden className="size-4 text-muted" />,
  info: <Info aria-hidden className="size-4 text-info" />,
  success: <CircleCheck aria-hidden className="size-4 text-success" />,
  warning: <TriangleAlert aria-hidden className="size-4 text-warning" />,
  danger: <CircleAlert aria-hidden className="size-4 text-danger" />,
}

export interface AlertProps {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  /** Button(s) on the right. */
  action?: ReactNode
  /** Shows a close button. */
  onDismiss?: () => void
  /** Replace the default tone icon (pass null to hide it). */
  icon?: ReactNode
  className?: string
  /** role="alert" (errors that appear after an action) instead of role="status". */
  assertive?: boolean
}

/** Inline message box (notices, inline errors). */
export function Alert({ tone = 'neutral', title, children, action, onDismiss, icon, className, assertive }: AlertProps) {
  return (
    <div role={assertive ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', toneClasses[tone], className)}>
      {icon === undefined ? <span className="mt-0.5 shrink-0">{toneIcons[tone]}</span> : icon}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? <div className={cn('text-muted', title ? 'mt-0.5' : undefined)}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 self-center">{action}</div> : null}
      {onDismiss ? (
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss} className="-my-1 -mr-2 shrink-0">
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

export interface InlineErrorProps {
  /** Anything thrown; ApiError details are shown as-is. */
  error: unknown
  /** What failed, e.g. "Could not load conversations". */
  title?: string
  onRetry?: () => void
  className?: string
}

/** Standard error block for a failed query, with an optional retry. */
export function InlineError({ error, title = 'Something went wrong', onRetry, className }: InlineErrorProps) {
  return (
    <Alert
      tone="danger"
      assertive
      title={title}
      className={className}
      action={
        onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {errorMessage(error)}
    </Alert>
  )
}
