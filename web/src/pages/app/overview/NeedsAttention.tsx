import { ChevronRight, CircleCheck, Inbox } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { NewFollowUpLink } from '@/components/new-followup-link'
import { ConversationStatusBadge } from '@/components/status-badges'
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  InlineError,
  Skeleton,
  buttonVariants,
} from '@/components/ui'
import type { ConversationSummary } from '@/lib/api'
import { conversationHeadline, pluralize } from '@/lib/format'
import { useConversations } from '@/lib/queries'
import { needsAttention } from './overview-data'

const VISIBLE = 5

/** Open conversations with nothing scheduled, most urgent first. */
export function NeedsAttention({ className }: { className?: string }) {
  const { data, isPending, isError, error, refetch } = useConversations()
  const items = useMemo(() => (data ? needsAttention(data) : []), [data])
  const shown = items.slice(0, VISIBLE)

  let body
  if (isPending) {
    body = (
      <>
        <span className="sr-only" role="status">
          Loading conversations
        </span>
        <ul aria-hidden className="divide-y divide-border border-t border-border">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="hidden h-5 w-24 sm:block" />
            </li>
          ))}
        </ul>
      </>
    )
  } else if (isError) {
    body = (
      <CardContent>
        <InlineError title="Could not load conversations" error={error} onRetry={() => void refetch()} />
      </CardContent>
    )
  } else if (!data.length) {
    body = (
      <CardContent>
        <EmptyState
          compact
          icon={Inbox}
          title="No conversations yet"
          description="Paste an email thread and the assistant will work out whether it needs a follow-up."
          action={<NewFollowUpLink variant="secondary" size="sm" />}
        />
      </CardContent>
    )
  } else if (!items.length) {
    body = (
      <CardContent>
        <EmptyState
          compact
          icon={CircleCheck}
          title="Nothing needs you right now"
          description="Every open conversation already has a follow-up scheduled. Closed ones need nothing more."
          action={
            <Link to="/app/scheduled" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              See what is scheduled
            </Link>
          }
        />
      </CardContent>
    )
  } else {
    body = (
      <ul className="divide-y divide-border border-t border-border">
        {shown.map((conversation) => (
          <AttentionRow key={conversation.id} conversation={conversation} />
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="needs-attention-title" className={className}>
      <Card className="flex h-full flex-col overflow-hidden">
        <CardHeader>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle id="needs-attention-title">Needs attention</CardTitle>
              {items.length ? (
                <Badge size="sm" mono>
                  {items.length}
                </Badge>
              ) : null}
            </div>
            <CardDescription>Open conversations with no follow-up scheduled. Open one and let the assistant decide.</CardDescription>
          </div>
          <Link to="/app/conversations" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-mr-2 shrink-0' })}>
            All conversations
          </Link>
        </CardHeader>
        {body}
        {items.length > VISIBLE ? (
          <CardFooter className="mt-auto justify-start">
            <Link to="/app/conversations" className={buttonVariants({ variant: 'link', className: 'text-sm text-muted hover:text-foreground' })}>
              {pluralize(items.length - VISIBLE, 'more conversation')} without a follow-up
              <ChevronRight aria-hidden />
            </Link>
          </CardFooter>
        ) : null}
      </Card>
    </section>
  )
}

function AttentionRow({ conversation: c }: { conversation: ConversationSummary }) {
  return (
    <li>
      <Link
        to={`/app/conversations/${encodeURIComponent(c.id)}`}
        className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:-outline-offset-2"
      >
        <Avatar name={c.contact.name} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium text-foreground">{c.contact.name}</span>
            <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">{c.subject}</span>
          </p>
          <p className="truncate text-sm text-muted">{conversationHeadline(c)}</p>
        </div>
        <ConversationStatusBadge conversation={c} size="sm" className="hidden sm:inline-flex" />
        <ChevronRight aria-hidden className="size-4 shrink-0 text-subtle" />
      </Link>
    </li>
  )
}
