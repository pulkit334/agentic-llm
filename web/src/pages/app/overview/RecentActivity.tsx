import { History } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RelativeTime } from '@/components/relative-time'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton, StatusDot, buttonVariants } from '@/components/ui'
import type { Activity } from '@/lib/api'
import { activityTone } from '@/lib/format'
import { useOverview } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { activityContext, activityReason } from './overview-data'

/**
 * The last few things the assistant and the scheduler recorded (GET /api/overview `recent`).
 * When the overview request fails, the page shows the error once above the tiles; this card
 * then just says the list is unavailable.
 */
export function RecentActivity({ className }: { className?: string }) {
  const { data, isPending, isError } = useOverview()

  let body: ReactNode
  if (isPending) {
    body = (
      <>
        <span className="sr-only" role="status">
          Loading recent activity
        </span>
        <ol aria-hidden className="divide-y divide-border border-t border-border">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex gap-3 px-5 py-3">
              <Skeleton className="mt-1.5 size-1.5 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-3 w-3/4" />
              </div>
            </li>
          ))}
        </ol>
      </>
    )
  } else if (isError) {
    body = (
      <CardContent>
        <EmptyState compact icon={History} title="Recent activity is unavailable" description="It appears here once the overview loads." />
      </CardContent>
    )
  } else if (!data.recent.length) {
    body = (
      <CardContent>
        <EmptyState
          compact
          icon={History}
          title="No activity yet"
          description="Every run, decision, send and reply is recorded here as it happens."
          action={
            <Link to="/app/conversations" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Open a conversation
            </Link>
          }
        />
      </CardContent>
    )
  } else {
    body = (
      <ol className="divide-y divide-border border-t border-border">
        {data.recent.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} />
        ))}
      </ol>
    )
  }

  return (
    <section aria-labelledby="recent-activity-title" className={className}>
      <Card className="flex h-full flex-col overflow-hidden">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle id="recent-activity-title">Recent activity</CardTitle>
            <CardDescription>What the assistant and the scheduler did last.</CardDescription>
          </div>
          <Link to="/app/activity" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-mr-2 shrink-0' })}>
            Full log
          </Link>
        </CardHeader>
        {body}
      </Card>
    </section>
  )
}

function ActivityRow({ activity }: { activity: Activity }) {
  const context = activityContext(activity)
  const reason = activityReason(activity)
  const content = (
    <>
      <StatusDot tone={activityTone(activity.action)} className="mt-2" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">{activity.label}</p>
          <RelativeTime value={activity.ts} title={activity.ts_local} className="shrink-0 text-xs text-subtle tabular-nums" />
        </div>
        {context ? <p className="truncate text-xs text-muted">{context}</p> : null}
        {reason ? (
          <p className="mt-1 line-clamp-2 text-xs text-subtle" title={reason}>
            {reason}
          </p>
        ) : null}
      </div>
    </>
  )
  const rowClass = 'flex gap-3 px-5 py-3'
  return (
    <li>
      {activity.thread_id ? (
        <Link
          to={`/app/conversations/${encodeURIComponent(activity.thread_id)}`}
          className={cn(rowClass, 'transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:-outline-offset-2')}
        >
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  )
}
