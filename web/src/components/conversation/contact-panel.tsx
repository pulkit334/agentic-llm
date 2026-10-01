import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ContactTypeBadge } from '@/components/status-badges'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ConversationDetail } from '@/lib/api'
import { contactTypeLabel, formatDateTime, formatHours, formatTimeZone, pluralize } from '@/lib/format'
import { BUSINESS_HOURS } from '@/lib/product'
import { useClock, useNow } from '@/lib/queries'

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
  )
}

/** Who the contact is, their local time, and the follow-up strategy for their type. */
export function ContactPanel({ conversation }: { conversation: ConversationDetail }) {
  const { contact, strategy, messages } = conversation
  const now = useNow()
  const { data: clock } = useClock()
  const followupsSent = messages.filter((m) => m.direction === 'outbound' && m.is_followup).length

  return (
    <Card>
      <section aria-labelledby="contact-heading" className="px-5 pt-5 pb-4">
        <h2 id="contact-heading" className="sr-only">
          Contact
        </h2>
        <div className="flex items-center gap-3">
          <Avatar name={contact.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-foreground">{contact.name}</p>
            <p className="truncate text-sm text-muted">{contact.email}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <Row term="Type">
            <ContactTypeBadge type={contact.type} size="sm" />
          </Row>
          {contact.company ? <Row term="Company">{contact.company}</Row> : null}
          <Row term="Their time">
            {clock ? <span className="tabular-nums">{formatDateTime(now, contact.timezone)}</span> : '…'}{' '}
            <span className="text-subtle">({formatTimeZone(contact.timezone)})</span>
          </Row>
          <Row term="Follow-ups sent">
            <span className="tabular-nums">
              {followupsSent} of {strategy.max_followups}
            </span>
          </Row>
        </dl>
      </section>

      <section aria-labelledby="strategy-heading" className="border-t border-border px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="strategy-heading" className="text-base font-medium tracking-tight text-foreground">
            {contactTypeLabel(contact.type)} strategy
          </h2>
          <Link to="/app/how-it-works#strategies" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-my-1 -mr-2 shrink-0' })}>
            How it works
          </Link>
        </div>
        <dl className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <Row term="Waits">{formatHours(strategy.delay_hours)} after our last message</Row>
          <Row term="At most">{pluralize(strategy.max_followups, 'follow-up')}</Row>
          {strategy.deadline_lead_hours ? <Row term="Deadlines">Goes out at least {formatHours(strategy.deadline_lead_hours)} before a deadline</Row> : null}
          <Row term="Sends">{BUSINESS_HOURS}</Row>
          <Row term="Tone">{strategy.tone}</Row>
          <Row term="Focus">{strategy.focus}</Row>
          <Row term="Length">{strategy.length}</Row>
        </dl>
      </section>
    </Card>
  )
}
