import { Ban, CalendarClock, MessagesSquare, Send } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { NewFollowUpLink } from '@/components/new-followup-link'
import { InlineError, PageHeader, Skeleton, StatTile } from '@/components/ui'
import { formatRelative, pluralize } from '@/lib/format'
import { useConversations, useNow, useOverview } from '@/lib/queries'
import { NeedsAttention } from './overview/NeedsAttention'
import { RecentActivity } from './overview/RecentActivity'
import { nextScheduledSend } from './overview/overview-data'

/** /app: the four counts, what needs a decision, and the latest recorded actions. */
export default function Overview() {
  const overview = useOverview()
  const conversations = useConversations()
  const now = useNow()

  const counts = overview.data?.counts
  const nextSend = useMemo(() => (conversations.data ? nextScheduledSend(conversations.data) : null), [conversations.data])

  const loading = overview.isPending
  const failed = overview.isError

  // Tiles show skeletons (value and hint line) until the overview arrives, and a dash with no
  // hint if it failed.
  const value = (n: number | undefined) => (n === undefined ? '—' : n)
  const hint = (text: ReactNode | undefined) => (failed ? undefined : text)

  let scheduledHint: ReactNode
  if (conversations.isPending) scheduledHint = <Skeleton className="h-3 w-28" />
  else if (conversations.isError) scheduledHint = undefined
  else if (!nextSend) scheduledHint = 'Nothing queued'
  else if (nextSend <= now) scheduledHint = 'One is due now'
  else scheduledHint = `Next goes out ${formatRelative(nextSend, now)}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Where every conversation stands, what needs a decision, and what the assistant did last."
        actions={<NewFollowUpLink />}
      />

      <section aria-label="Summary" className="flex flex-col gap-3">
        {overview.isError ? (
          <InlineError title="Could not load the overview" error={overview.error} onRetry={() => void overview.refetch()} />
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Open"
            value={value(counts?.open)}
            hint={hint(counts && `of ${pluralize(counts.conversations, 'conversation')}`)}
            icon={MessagesSquare}
            to="/app/conversations"
            loading={loading}
          />
          <StatTile
            label="Scheduled"
            value={value(counts?.scheduled)}
            hint={hint(scheduledHint)}
            icon={CalendarClock}
            to="/app/scheduled"
            loading={loading}
          />
          <StatTile
            label="Sent"
            value={value(counts?.sent)}
            hint={hint(overview.data?.email_mode === 'smtp' ? 'Delivered over SMTP' : 'Via the mock outbox')}
            icon={Send}
            to="/app/sent"
            loading={loading}
          />
          <StatTile
            label="Skipped"
            value={value(counts?.skipped)}
            hint={hint('Decided not to send')}
            icon={Ban}
            to="/app/activity"
            loading={loading}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <NeedsAttention className="lg:col-span-3" />
        <RecentActivity className="lg:col-span-2" />
      </div>
    </div>
  )
}
