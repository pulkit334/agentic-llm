import type { ReactNode } from 'react'
import { RelativeTime } from '@/components/relative-time'
import type { FollowUp } from '@/lib/api'
import { formatCountdown, formatRelative, formatTimeZone, parseDate } from '@/lib/format'
import { useNow } from '@/lib/queries'
import { cn } from '@/lib/utils'

export interface TimeBlockProps {
  /** Small label above the value, e.g. "Goes out in". */
  eyebrow: ReactNode
  /** The main figure: a countdown or a date. */
  value: ReactNode
  /** Mono, larger figure (countdowns). Default false. */
  mono?: boolean
  /** Up to two short supporting lines. */
  lines?: ReactNode[]
  className?: string
}

/**
 * The left-hand "when" column of a follow-up or sent-email row.
 * A single wrapped line on phones, a stacked column from `sm` up.
 */
export function TimeBlock({ eyebrow, value, mono, lines = [], className }: TimeBlockProps) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-col sm:items-start sm:gap-y-0.5', className)}>
      <span className="text-xs text-muted">{eyebrow}</span>
      <span className={cn('text-foreground', mono ? 'font-mono text-lg font-medium tabular-nums' : 'text-base font-medium')}>{value}</span>
      {lines.map((line, i) => (
        <span key={i} className={cn(i === 0 ? 'text-sm text-muted' : 'text-xs text-subtle')}>
          {line}
        </span>
      ))}
    </div>
  )
}

export interface FollowUpTimingProps {
  followup: Pick<FollowUp, 'status' | 'send_at' | 'send_at_local' | 'done_at' | 'done_at_local' | 'contact'>
  className?: string
}

/**
 * When a follow-up goes out (pending), went out (sent: the actual send time, which "Send due now"
 * can make later than the scheduled one) or was due (cancelled).
 * Countdowns use the simulated demo clock; absolute times are in the contact's time zone.
 */
export function FollowUpTiming({ followup, className }: FollowUpTimingProps) {
  const now = useNow()
  const zone = `${formatTimeZone(followup.contact.timezone)} time`

  if (followup.status === 'pending') {
    const due = parseDate(followup.send_at).getTime() <= now.getTime()
    if (due) {
      return <TimeBlock className={className} eyebrow="Due" value="Now" mono lines={[followup.send_at_local, 'Goes out on the next send run']} />
    }
    return (
      <TimeBlock
        className={className}
        eyebrow="Goes out in"
        mono
        value={
          <>
            <span aria-hidden>{formatCountdown(followup.send_at, now)}</span>
            <span className="sr-only">{formatRelative(followup.send_at, now)}</span>
          </>
        }
        lines={[followup.send_at_local, zone]}
      />
    )
  }

  const sent = followup.status === 'sent'
  const at = sent && followup.done_at ? followup.done_at : followup.send_at
  const atLocal = sent && followup.done_at_local ? followup.done_at_local : followup.send_at_local
  return (
    <TimeBlock
      className={className}
      eyebrow={sent ? 'Sent' : 'Was due'}
      value={atLocal}
      lines={[<RelativeTime key="relative" value={at} />, zone]}
    />
  )
}
