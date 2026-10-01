import { ChevronDown, MessagesSquare } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { RelativeTime } from '@/components/relative-time'
import { ContactTypeBadge, FollowupStatusBadge } from '@/components/status-badges'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import type { Contact, FollowUp } from '@/lib/api'
import { contactTypeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CancelFollowUpButton } from './CancelFollowUpButton'
import { EditFollowUpButton } from './EditFollowUpDialog'
import { EmailBody } from './EmailBody'
import { FollowUpTiming } from './FollowUpTiming'

export interface FollowUpCardProps {
  followup: FollowUp
  /** Contact row (avatar, name, type, email). Turn off where the contact is already shown. Default true. */
  showContact?: boolean
  /** Status badge (Scheduled / Sent / Cancelled). Default true. */
  showStatus?: boolean
  /** Link to the conversation. Turn off on the conversation page itself. Default true. */
  showConversationLink?: boolean
  /** Edit and Cancel buttons on pending follow-ups. Default true. */
  showActions?: boolean
  /** Start with the full email visible instead of a two-line preview. Default false. */
  defaultExpanded?: boolean
  /** Border and surface. Turn off inside a divided list (see FollowUpList). Default true. */
  bordered?: boolean
  /** Heading element for the subject, to fit the page outline. Default h3. */
  titleAs?: 'h2' | 'h3' | 'h4'
  className?: string
}

/**
 * One follow-up: when it goes out (countdown on the demo clock), who it is for, the subject,
 * an expandable preview of the email, why it was scheduled (or cancelled), and — while it is
 * pending — Edit and Cancel.
 */
export function FollowUpCard({
  followup,
  showContact = true,
  showStatus = true,
  showConversationLink = true,
  showActions = true,
  defaultExpanded = false,
  bordered = true,
  titleAs: Title = 'h3',
  className,
}: FollowUpCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const titleId = useId()
  const bodyId = useId()
  const pending = followup.status === 'pending'
  const strategy = followup.strategy && followup.strategy !== followup.contact.type ? followup.strategy : null

  return (
    <article
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-5', bordered && 'rounded-lg border border-border bg-surface', className)}
    >
      <FollowUpTiming followup={followup} className="sm:w-36 sm:shrink-0" />

      <div className="min-w-0 flex-1">
        {showContact || showStatus ? (
          <div className="mb-2 flex items-start justify-between gap-3">
            {showContact ? <ContactLine contact={followup.contact} /> : <span />}
            {showStatus ? <FollowupStatusBadge status={followup.status} size="sm" /> : null}
          </div>
        ) : null}

        <Title id={titleId} className="text-base font-medium break-words text-foreground">
          {followup.subject}
        </Title>

        {expanded ? (
          <EmailBody id={bodyId} className="mt-3">
            {followup.body}
          </EmailBody>
        ) : (
          <p id={bodyId} className="mt-1 line-clamp-2 text-sm break-words text-muted">
            {followup.body}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {followup.reason ? (
            <>
              <dt className="text-subtle">Why</dt>
              <dd className="break-words text-muted">{followup.reason}</dd>
            </>
          ) : null}
          {followup.status === 'cancelled' ? (
            <>
              <dt className="text-subtle">Cancelled</dt>
              <dd className="break-words text-muted">{followup.cancel_reason || 'No reason was recorded.'}</dd>
            </>
          ) : null}
          <dt className="text-subtle">Queued</dt>
          <dd className="text-muted">
            <RelativeTime value={followup.created_at} />
            {strategy ? <> · {contactTypeLabel(strategy)} strategy</> : null}
          </dd>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
          <Button variant="ghost" size="sm" className="-ml-2.5" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((v) => !v)}>
            <ChevronDown aria-hidden className={cn('transition-transform duration-150', expanded && 'rotate-180')} />
            {expanded ? 'Hide email' : 'Show email'}
          </Button>
          {showConversationLink ? (
            <Link to={`/app/conversations/${encodeURIComponent(followup.thread_id)}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <MessagesSquare aria-hidden />
              Conversation
            </Link>
          ) : null}
          {pending && showActions ? (
            <div className="ml-auto flex items-center gap-2">
              <CancelFollowUpButton followup={followup} />
              <EditFollowUpButton followup={followup} />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function ContactLine({ contact }: { contact: Contact }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Avatar name={contact.name} size="sm" />
      <span className="truncate text-sm font-medium text-foreground">{contact.name}</span>
      <ContactTypeBadge type={contact.type} size="sm" />
      <span className="min-w-0 truncate text-sm text-muted">{contact.email}</span>
    </div>
  )
}

/** Placeholder with the same shape as FollowUpCard (no border, for use inside FollowUpList). */
export function FollowUpCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-5">
      <div className="flex items-center gap-2 sm:w-36 sm:shrink-0 sm:flex-col sm:items-start">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-2/3" />
        <SkeletonText lines={2} />
      </div>
    </div>
  )
}
