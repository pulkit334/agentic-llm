import { CalendarClock, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SentEmailItem, SentEmailItemSkeleton } from '@/components/followup'
import { Badge, EmptyState, InlineError, PageHeader, buttonVariants } from '@/components/ui'
import { EMAIL_MODE_LABELS, pluralize } from '@/lib/format'
import { useOverview, useSent } from '@/lib/queries'

const DESCRIPTIONS = {
  mock: 'Every email the assistant has sent. Email runs in mock mode, so messages are recorded here and never leave the app.',
  smtp: 'Every email the assistant has sent over SMTP, with the address each one was actually delivered to.',
  unknown: 'Every email the assistant has sent, with the provider and the address each one was delivered to.',
} as const

/** The outbox: every email sent (or attempted), newest first, with provider and actual recipient. */
export default function Sent() {
  const sent = useSent()
  const { data: overview } = useOverview()
  const mode = overview?.email_mode
  const emails = sent.data ?? []
  const failed = emails.filter((e) => e.status === 'failed').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sent"
        meta={mode ? <Badge tone="outline">{EMAIL_MODE_LABELS[mode] ?? mode}</Badge> : null}
        description={DESCRIPTIONS[mode ?? 'unknown'] ?? DESCRIPTIONS.unknown}
      />

      {sent.isPending ? (
        <div role="status" className="divide-y divide-border rounded-lg border border-border bg-surface">
          <span className="sr-only">Loading sent emails</span>
          {Array.from({ length: 3 }, (_, i) => (
            <SentEmailItemSkeleton key={i} />
          ))}
        </div>
      ) : sent.isError && !sent.data ? (
        <InlineError error={sent.error} title="Could not load sent emails" onRetry={() => void sent.refetch()} />
      ) : emails.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No emails sent yet"
          description="Emails show up here when a scheduled follow-up reaches its send time, or when the assistant answers a question right away. Move the demo clock forward to send what is due."
          action={
            <Link to="/app/scheduled" className={buttonVariants()}>
              <CalendarClock aria-hidden />
              View scheduled
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{pluralize(emails.length, 'email')}, newest first.</p>
            {failed ? (
              <Badge tone="danger" dot>
                {failed} failed
              </Badge>
            ) : null}
          </div>
          <ul aria-label="Sent emails" className="divide-y divide-border rounded-lg border border-border bg-surface">
            {emails.map((email) => (
              <li key={email.id}>
                <SentEmailItem email={email} titleAs="h2" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
