import { ChevronDown, MessagesSquare } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { RelativeTime } from '@/components/relative-time'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import type { SentEmail } from '@/lib/api'
import { EMAIL_MODE_LABELS, formatTimeZone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmailBody } from './EmailBody'
import { TimeBlock } from './FollowUpTiming'

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export interface SentEmailItemProps {
  email: SentEmail
  /** Link to the conversation when the email belongs to one. Default true. */
  showConversationLink?: boolean
  /** Border and surface. Off by default (it usually sits in a divided list). */
  bordered?: boolean
  /** Heading element for the subject. Default h3. */
  titleAs?: 'h2' | 'h3' | 'h4'
  className?: string
}

/**
 * One outbox entry: when it went out, who it was for, which provider sent it and the address it
 * was actually delivered to (a demo redirect can differ from the contact's address).
 */
export function SentEmailItem({ email, showConversationLink = true, bordered = false, titleAs: Title = 'h3', className }: SentEmailItemProps) {
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()
  const bodyId = useId()
  const failed = email.status === 'failed'
  const mock = email.provider === 'mock'
  const redirected = !sameAddress(email.delivered_to, email.to_email)
  const providerLabel = EMAIL_MODE_LABELS[email.provider as 'mock' | 'smtp'] ?? email.provider
  // sent_at_local is in the recipient's zone, or the demo clock's when the address has no contact.
  const zoneLabel = `${formatTimeZone(email.timezone)} time`

  return (
    <article
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-5', bordered && 'rounded-lg border border-border bg-surface', className)}
    >
      <TimeBlock
        className="sm:w-36 sm:shrink-0"
        eyebrow={failed ? 'Attempted' : 'Sent'}
        value={email.sent_at_local}
        lines={[<RelativeTime key="relative" value={email.sent_at} />, zoneLabel]}
      />

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Avatar name={email.contact_name || email.to_email} size="sm" />
            {email.contact_name ? <span className="truncate text-sm font-medium text-foreground">{email.contact_name}</span> : null}
            <span className={cn('min-w-0 truncate text-sm', email.contact_name ? 'text-muted' : 'font-medium text-foreground')}>{email.to_email}</span>
          </div>
          {failed ? (
            <Badge tone="danger" dot size="sm">
              Failed
            </Badge>
          ) : (
            <Badge tone="success" dot size="sm">
              Sent
            </Badge>
          )}
        </div>

        <Title id={titleId} className="text-base font-medium break-words text-foreground">
          {email.subject}
        </Title>

        {expanded ? (
          <EmailBody id={bodyId} className="mt-3">
            {email.body}
          </EmailBody>
        ) : (
          <p id={bodyId} className="mt-1 line-clamp-2 text-sm break-words text-muted">
            {email.body}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-subtle">Provider</dt>
          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            <Badge tone="outline" size="sm">
              {providerLabel}
            </Badge>
            {mock ? <span>Recorded here only, not emailed</span> : null}
          </dd>
          <dt className="text-subtle">Delivered to</dt>
          <dd className="min-w-0 text-muted">
            <span className="font-mono text-xs break-all text-foreground">{email.delivered_to}</span>
            {redirected ? <span className="mt-0.5 block text-xs">Redirected from {email.to_email} by the demo mail setting</span> : null}
          </dd>
        </dl>

        {failed ? (
          <Alert tone="danger" className="mt-3" title="This email was not delivered">
            {email.error || 'The mail server did not accept it.'}
          </Alert>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
          <Button variant="ghost" size="sm" className="-ml-2.5" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((v) => !v)}>
            <ChevronDown aria-hidden className={cn('transition-transform duration-150', expanded && 'rotate-180')} />
            {expanded ? 'Hide email' : 'Show email'}
          </Button>
          {showConversationLink && email.thread_id ? (
            <Link to={`/app/conversations/${encodeURIComponent(email.thread_id)}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <MessagesSquare aria-hidden />
              Conversation
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}

/** Placeholder with the same shape as SentEmailItem. */
export function SentEmailItemSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-5">
      <div className="flex items-center gap-2 sm:w-36 sm:shrink-0 sm:flex-col sm:items-start">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-4 w-1/2" />
        <SkeletonText lines={2} />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  )
}
