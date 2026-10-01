import type { FollowUp } from '@/lib/api'
import { FollowUpCard, FollowUpCardSkeleton, type FollowUpCardProps } from './FollowUpCard'

export interface FollowUpListProps extends Omit<FollowUpCardProps, 'followup' | 'bordered' | 'className'> {
  followups: FollowUp[]
  /** Accessible name of the list, e.g. "Pending follow-ups". */
  label: string
}

/** Follow-ups as rows in one bordered panel, separated by hairlines. */
export function FollowUpList({ followups, label, ...cardProps }: FollowUpListProps) {
  return (
    <ul aria-label={label} className="divide-y divide-border rounded-lg border border-border bg-surface">
      {followups.map((followup) => (
        <li key={followup.id}>
          <FollowUpCard followup={followup} bordered={false} {...cardProps} />
        </li>
      ))}
    </ul>
  )
}

/** Loading state for FollowUpList. */
export function FollowUpListSkeleton({ rows = 3, label = 'Loading follow-ups' }: { rows?: number; label?: string }) {
  return (
    <div role="status" className="divide-y divide-border rounded-lg border border-border bg-surface">
      {/* First, so the hairline divider logic still ends on the last visible row. */}
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <FollowUpCardSkeleton key={i} />
      ))}
    </div>
  )
}
