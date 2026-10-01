import { formatDateTime, formatRelative, parseDate } from '@/lib/format'
import { useNow } from '@/lib/queries'
import { cn } from '@/lib/utils'

export interface RelativeTimeProps {
  /** ISO timestamp from the API. */
  value: string
  /** Absolute text for the tooltip, e.g. the API's `*_local` string. Defaults to the clock time zone. */
  title?: string
  className?: string
}

/** "in 1 day" / "3 hours ago", measured against the simulated demo clock, in a <time> element. */
export function RelativeTime({ value, title, className }: RelativeTimeProps) {
  const now = useNow()
  const date = parseDate(value)
  return (
    <time dateTime={date.toISOString()} title={title ?? formatDateTime(date)} className={cn('whitespace-nowrap', className)}>
      {formatRelative(date, now)}
    </time>
  )
}
