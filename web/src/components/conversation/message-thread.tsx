import { Clock, Repeat, Reply } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Logo } from '@/components/brand'
import { RelativeTime } from '@/components/relative-time'
import { FollowupActions } from '@/components/run/followup-actions'
import { FollowupStatusBadge } from '@/components/status-badges'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { Contact, ConversationDetail, FollowUp, Message } from '@/lib/api'
import { conversationHeadline, firstName, formatDateTime, formatHours, formatTimeZone, parseDate, pluralize, possessive } from '@/lib/format'
import { useClock, useNow } from '@/lib/queries'
import { cn } from '@/lib/utils'

const HOUR = 3_600_000

function hoursBetween(from: string | Date, to: string | Date): number {
  return (parseDate(to).getTime() - parseDate(from).getTime()) / HOUR
}

/** A hairline with a short centred note, e.g. "2 days later". */
function Divider({ children, dashed }: { children: ReactNode; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-xs text-subtle">
      <span aria-hidden className={cn('h-px flex-1', dashed ? 'border-t border-dashed border-border-strong' : 'bg-border')} />
      <span className="shrink-0">{children}</span>
      <span aria-hidden className={cn('h-px flex-1', dashed ? 'border-t border-dashed border-border-strong' : 'bg-border')} />
    </div>
  )
}

function Sender({ outbound, contact }: { outbound: boolean; contact: Contact }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {outbound ? <Logo size={20} className="text-foreground" /> : <Avatar name={contact.name} size="sm" />}
      <span className="truncate text-sm font-medium text-foreground">{outbound ? 'You' : contact.name}</span>
      <span className="shrink-0 text-xs text-subtle">to {outbound ? firstName(contact.name) : 'you'}</span>
    </span>
  )
}

function MessageItem({ message, contact }: { message: Message; contact: Contact }) {
  const outbound = message.direction === 'outbound'
  return (
    <article
      aria-label={`${outbound ? 'You' : contact.name}, ${message.sent_at_local}${message.is_followup ? ', follow-up' : ''}`}
      className={cn('rounded-lg border border-border p-4', outbound ? 'bg-surface-2' : 'bg-background')}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Sender outbound={outbound} contact={contact} />
        {message.is_followup ? (
          <Badge size="sm" tone="outline">
            <Repeat aria-hidden className="size-3" />
            Follow-up
          </Badge>
        ) : null}
        <time dateTime={parseDate(message.sent_at).toISOString()} className="ml-auto text-xs whitespace-nowrap text-muted tabular-nums">
          {message.sent_at_local}
        </time>
      </header>
      <div className="mt-3 text-sm leading-6 break-words whitespace-pre-wrap text-foreground">{message.body}</div>
    </article>
  )
}

/** A pending follow-up shown as the next, not-yet-sent message of the thread. */
function ScheduledItem({ followup, contact, repliedSince }: { followup: FollowUp; contact: Contact; repliedSince: boolean }) {
  return (
    <article aria-label={`Scheduled follow-up, goes out ${followup.send_at_local}`} className="rounded-lg border border-dashed border-border-strong bg-background p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Sender outbound contact={contact} />
        <FollowupStatusBadge status="pending" size="sm" />
        <span className="ml-auto flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
          <span className="tabular-nums">{followup.send_at_local}</span>
          <span aria-hidden className="text-subtle">
            ·
          </span>
          <RelativeTime value={followup.send_at} title={followup.send_at_local} className="text-foreground" />
        </span>
      </header>
      <p className="mt-3 text-sm font-medium break-words text-foreground">{followup.subject}</p>
      <div className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap text-muted">{followup.body}</div>
      {followup.reason ? (
        <p className="mt-3 text-xs break-words text-subtle">
          <span className="font-medium text-muted">Why: </span>
          {followup.reason}
        </p>
      ) : null}
      {repliedSince ? (
        <Alert tone="warning" className="mt-3">
          {firstName(contact.name)} replied after this was scheduled, so it will be cancelled automatically at its send time. You can also cancel it now.
        </Alert>
      ) : null}
      <FollowupActions followup={followup} className="mt-4" />
    </article>
  )
}

export interface MessageThreadProps {
  conversation: ConversationDetail
  onSimulateReply: () => void
}

/**
 * The conversation as an email thread: us and them, follow-ups marked, the time between messages,
 * where the simulated clock is now, and any follow-up still waiting to go out.
 */
export function MessageThread({ conversation, onSimulateReply }: MessageThreadProps) {
  const { contact, messages } = conversation
  const now = useNow()
  const { data: clock } = useClock()
  const pending = conversation.followups.filter((f) => f.status === 'pending').sort((a, b) => parseDate(a.send_at).getTime() - parseDate(b.send_at).getTime())
  const last = messages[messages.length - 1]
  const sinceLast = last ? hoursBetween(last.sent_at, now) : null

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="min-w-0">
          <CardTitle>Thread</CardTitle>
          <CardDescription>
            {pluralize(messages.length, 'message')} · times in {possessive(contact.name)} time zone ({formatTimeZone(contact.timezone)})
          </CardDescription>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-3 px-5 py-5">
        {messages.length === 0 ? <p className="py-6 text-center text-sm text-muted">This conversation has no messages yet.</p> : null}

        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const gap = previous ? hoursBetween(previous.sent_at, message.sent_at) : 0
          return (
            <Fragment key={message.id}>
              {gap >= 1 ? <Divider>{formatHours(gap)} later</Divider> : null}
              <MessageItem message={message} contact={contact} />
            </Fragment>
          )
        })}

        {last && sinceLast !== null && sinceLast >= 0 ? (
          <Divider dashed>
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden className="size-3" />
              Now{clock ? `, ${formatDateTime(now, contact.timezone)}` : ''}
              {sinceLast >= 1 ? ` · ${formatHours(sinceLast)} since the last message` : ''}
            </span>
          </Divider>
        ) : null}

        {pending.map((followup) => {
          const created = parseDate(followup.created_at).getTime()
          const repliedSince = messages.some((m) => m.direction === 'inbound' && parseDate(m.sent_at).getTime() >= created)
          return <ScheduledItem key={followup.id} followup={followup} contact={contact} repliedSince={repliedSince} />
        })}
      </div>

      <CardFooter className="flex-wrap justify-between gap-3">
        <p className="min-w-0 text-sm text-muted">{conversationHeadline(conversation)}</p>
        <Button size="sm" onClick={onSimulateReply}>
          <Reply aria-hidden />
          Simulate a reply
        </Button>
      </CardFooter>
    </Card>
  )
}
