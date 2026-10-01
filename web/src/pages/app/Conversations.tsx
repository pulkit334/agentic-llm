import { MessagesSquare } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NewFollowUpLink } from '@/components/new-followup-link'
import { RelativeTime } from '@/components/relative-time'
import { ContactTypeBadge, ConversationStatusBadge } from '@/components/status-badges'
import { InlineError } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ConversationSummary } from '@/lib/api'
import { CONVERSATION_STATE_META, conversationHeadline, conversationState, type ConversationState } from '@/lib/format'
import { useConversations } from '@/lib/queries'
import { cn } from '@/lib/utils'

type Filter = 'all' | ConversationState

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'waiting', label: CONVERSATION_STATE_META.waiting.label },
  { value: 'replied', label: CONVERSATION_STATE_META.replied.label },
  { value: 'scheduled', label: CONVERSATION_STATE_META.scheduled.label },
  { value: 'closed', label: CONVERSATION_STATE_META.closed.label },
]

const EMPTY_FILTER_TEXT: Record<ConversationState, string> = {
  waiting: 'No conversation is waiting on a reply right now.',
  replied: 'Nobody has replied since your last message.',
  scheduled: 'No follow-ups are scheduled. Open a conversation and let the assistant decide.',
  closed: 'No conversation is closed. A conversation closes when the contact opts out.',
}

const COLUMNS = 'md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_176px_112px]'

function isFilter(value: string | null): value is Filter {
  return FILTERS.some((f) => f.value === value)
}

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const { contact } = conversation
  return (
    <Link
      to={`/app/conversations/${encodeURIComponent(conversation.id)}`}
      className={cn(
        'grid gap-x-4 gap-y-1.5 px-4 py-3 transition-colors duration-150 hover:bg-surface-2 focus-visible:-outline-offset-2 md:items-center',
        COLUMNS,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={contact.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
          <ContactTypeBadge type={contact.type} size="sm" className="mt-0.5" />
        </div>
        <RelativeTime value={conversation.last_message_at} className="ml-auto self-start text-xs text-subtle md:hidden" />
      </div>
      <div className="min-w-0 pl-10 md:pl-0">
        <p className="truncate text-sm text-foreground">{conversation.subject}</p>
        <p className="truncate text-xs text-muted">{conversationHeadline(conversation)}</p>
      </div>
      <div className="pl-10 md:pl-0">
        <ConversationStatusBadge conversation={conversation} size="sm" />
      </div>
      <div className="hidden text-right text-sm text-muted md:block">
        <RelativeTime value={conversation.last_message_at} />
      </div>
    </Link>
  )
}

function ListFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div aria-hidden className={cn('hidden h-9 items-center gap-4 border-b border-border px-4 text-xs font-medium text-muted md:grid', COLUMNS)}>
        <span>Contact</span>
        <span>Conversation</span>
        <span>Status</span>
        <span className="text-right">Last message</span>
      </div>
      {children}
    </div>
  )
}

function ListSkeleton() {
  return (
    <ListFrame>
      <ul aria-busy="true" aria-label="Loading conversations" className="divide-y divide-border">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className={cn('grid gap-x-4 gap-y-2 px-4 py-3 md:items-center', COLUMNS)}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <div className="space-y-1.5 pl-10 md:pl-0">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="pl-10 md:pl-0">
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="hidden h-3.5 w-16 justify-self-end md:block" />
          </li>
        ))}
      </ul>
    </ListFrame>
  )
}

/** Every conversation and where it stands, filterable by state. */
export default function Conversations() {
  const { data, isPending, isError, error, refetch } = useConversations()
  const [params, setParams] = useSearchParams()
  const raw = params.get('state')
  const filter: Filter = isFilter(raw) ? raw : 'all'

  const setFilter = (value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'all') next.delete('state')
        else next.set('state', value)
        return next
      },
      { replace: true },
    )
  }

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, waiting: 0, replied: 0, scheduled: 0, closed: 0 }
    for (const c of data ?? []) {
      result.all++
      result[conversationState(c)]++
    }
    return result
  }, [data])

  const visible = useMemo(() => (data ?? []).filter((c) => filter === 'all' || conversationState(c) === filter), [data, filter])

  const newButton = <NewFollowUpLink />

  let content: ReactNode
  if (isPending) {
    content = <ListSkeleton />
  } else if (!data) {
    content = <InlineError error={error} title="Could not load conversations" onRetry={() => void refetch()} />
  } else if (data.length === 0) {
    content = (
      <EmptyState
        icon={MessagesSquare}
        title="No conversations yet"
        description="Paste an email thread and the assistant will decide whether it needs a follow-up, and when."
        action={newButton}
      />
    )
  } else {
    content = (
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList aria-label="Filter by status">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
              <Badge size="sm" mono>
                {counts[f.value]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filter}>
          {visible.length === 0 && filter !== 'all' ? (
            <EmptyState
              compact
              icon={MessagesSquare}
              title={`Nothing in “${FILTERS.find((f) => f.value === filter)?.label}”`}
              description={EMPTY_FILTER_TEXT[filter]}
              action={
                <Button size="sm" onClick={() => setFilter('all')}>
                  Show all conversations
                </Button>
              }
            />
          ) : (
            <ListFrame>
              <ul className="divide-y divide-border">
                {visible.map((c) => (
                  <li key={c.id}>
                    <ConversationRow conversation={c} />
                  </li>
                ))}
              </ul>
            </ListFrame>
          )}
        </TabsContent>
      </Tabs>
    )
  }

  return (
    <>
      <PageHeader title="Conversations" description="Every conversation the assistant is watching, and where each one stands." actions={newButton} />
      {isError && data ? (
        <InlineError className="mt-6" error={error} title="Could not refresh conversations" onRetry={() => void refetch()} />
      ) : null}
      <div className="mt-6">{content}</div>
    </>
  )
}
