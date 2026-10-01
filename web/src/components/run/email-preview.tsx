import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmailPreviewProps {
  to: ReactNode
  subject: string
  body: string
  /** A line under the message, e.g. when it goes out. */
  footer?: ReactNode
  /** Small label above the headers, e.g. "Drafted follow-up". */
  label?: ReactNode
  /** Dashed outline for something that has not been sent yet. */
  draft?: boolean
  className?: string
}

/** An email as it will be (or was) sent: recipient, subject, body. */
export function EmailPreview({ to, subject, body, footer, label, draft, className }: EmailPreviewProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-background', draft ? 'border-dashed border-border-strong' : 'border-border', className)}>
      {label ? <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted">{label}</p> : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-border px-4 py-3 text-sm">
        <dt className="text-subtle">To</dt>
        <dd className="min-w-0 truncate text-foreground">{to}</dd>
        <dt className="text-subtle">Subject</dt>
        <dd className="min-w-0 font-medium break-words text-foreground">{subject}</dd>
      </dl>
      <div className="px-4 py-3 text-sm leading-6 break-words whitespace-pre-wrap text-foreground">{body}</div>
      {footer ? <div className="border-t border-border bg-surface px-4 py-2.5 text-sm text-muted">{footer}</div> : null}
    </div>
  )
}
