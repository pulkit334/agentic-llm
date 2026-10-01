import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowRight, History, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NewFollowUpLink } from '@/components/new-followup-link'
import { Button, EmptyState, InlineError, PageHeader, Select, Spinner, buttonVariants } from '@/components/ui'
import { listActivity, type ActivityParams } from '@/lib/api'
import { formatTimeZone, pluralize, truncate } from '@/lib/format'
import { useClock, useConversations } from '@/lib/queries'
import { queryKeys } from '@/lib/query'
import { ActivityFeed, ActivityFeedSkeleton } from './activity/ActivityFeed'
import { ACTIVITY_TZ } from './activity/describe'

/** Entries fetched per page; "Load older entries" adds another page. */
const PAGE_SIZE = 100
/** The API's upper bound for `limit` (api/routes_data.py MAX_ACTIVITY_LIMIT). */
const MAX_LIMIT = 500

/**
 * /app/activity: the audit log. Every action the assistant, the scheduler and people took,
 * newest first, grouped by day and by run, filterable by conversation (`?thread=<id>`).
 */
export default function Activity() {
  const [searchParams, setSearchParams] = useSearchParams()
  const threadId = searchParams.get('thread')?.trim() || undefined

  // The page size belongs to one filter: switching conversations starts again at one page.
  const [paging, setPaging] = useState<{ thread?: string; limit: number }>({ limit: PAGE_SIZE })
  const limit = paging.thread === threadId ? paging.limit : PAGE_SIZE

  const params: ActivityParams = { thread_id: threadId, limit }
  const activity = useQuery({
    queryKey: queryKeys.activity(params),
    queryFn: ({ signal }) => listActivity(params, signal),
    placeholderData: keepPreviousData,
  })
  const conversations = useConversations()
  const clock = useClock()
  const filterId = useId()

  const setThread = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('thread', id)
        else next.delete('thread')
        return next
      },
      { replace: true },
    )
  }

  const selected = threadId ? conversations.data?.find((c) => c.id === threadId) : undefined
  const items = activity.data ?? []
  const switching = activity.isPlaceholderData
  const canLoadMore = !switching && items.length >= limit && limit < MAX_LIMIT
  const tz = formatTimeZone(clock.data?.tz ?? ACTIVITY_TZ)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Every decision, email and safety check the assistant recorded, newest first. Open an entry to see exactly what was logged."
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label htmlFor={filterId} className="sr-only">
              Conversation
            </label>
            <Select
              id={filterId}
              value={threadId ?? ''}
              onChange={(e) => setThread(e.target.value)}
              wrapperClassName="w-full sm:w-80"
              disabled={conversations.isPending && !threadId}
            >
              <option value="">All conversations</option>
              {threadId && !selected ? <option value={threadId}>{conversations.isPending ? 'Loading conversation…' : `Conversation ${threadId}`}</option> : null}
              {conversations.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.contact.name} — ${truncate(c.subject, 48)}`}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {threadId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="min-w-0 text-sm text-muted">
            Showing activity for{' '}
            {selected ? (
              <>
                <span className="font-medium text-foreground">{selected.contact.name}</span>
                <span aria-hidden> · </span>
                <span className="text-foreground">{selected.subject}</span>
              </>
            ) : (
              <span className="font-mono text-foreground">{threadId}</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link to={`/app/conversations/${encodeURIComponent(threadId)}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Open conversation
              <ArrowRight aria-hidden />
            </Link>
            <Button size="sm" onClick={() => setThread('')}>
              <X aria-hidden />
              Show all
            </Button>
          </div>
        </div>
      ) : null}

      {activity.isPending ? (
        <div role="status">
          <span className="sr-only">Loading activity</span>
          <ActivityFeedSkeleton />
        </div>
      ) : activity.isError && !activity.data ? (
        <InlineError title="Could not load activity" error={activity.error} onRetry={() => void activity.refetch()} />
      ) : items.length === 0 ? (
        threadId ? (
          <EmptyState
            icon={History}
            title="Nothing recorded for this conversation yet"
            description="Ask the assistant to review it. Each step it takes, what it read, what it decided and what it sent, will appear here."
            action={
              <>
                <Link to={`/app/conversations/${encodeURIComponent(threadId)}`} className={buttonVariants({ variant: 'primary' })}>
                  Open conversation
                </Link>
                <Button onClick={() => setThread('')}>
                  Show all activity
                </Button>
              </>
            }
          />
        ) : (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="When the assistant reviews a conversation, every step is recorded here: what it read, what it decided, and what it scheduled or sent."
            action={
              <>
                <NewFollowUpLink />
                <Link to="/app/conversations" className={buttonVariants()}>
                  Browse conversations
                </Link>
              </>
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-6">
          {activity.isError ? (
            <InlineError title="Could not refresh activity" error={activity.error} onRetry={() => void activity.refetch()} />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <p aria-live="polite">
              {items.length >= limit ? `The latest ${pluralize(items.length, 'entry', 'entries')}` : pluralize(items.length, 'entry', 'entries')}
              <span aria-hidden> · </span>
              Times in {tz} time
            </p>
            {activity.isFetching ? <Spinner size={14} label="Refreshing activity" /> : null}
          </div>

          <div aria-busy={switching || undefined} className={switching ? 'opacity-60 transition-opacity duration-150' : undefined}>
            <ActivityFeed items={items} showConversation={!threadId} />
          </div>

          {canLoadMore ? (
            <div className="flex justify-center border-t border-border pt-6">
              <Button onClick={() => setPaging({ thread: threadId, limit: Math.min(limit + PAGE_SIZE, MAX_LIMIT) })}>
                Load older entries
              </Button>
            </div>
          ) : items.length >= MAX_LIMIT ? (
            <p className="border-t border-border pt-6 text-center text-xs text-muted">
              Showing the latest {MAX_LIMIT} entries. Filter by conversation to see older ones.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
