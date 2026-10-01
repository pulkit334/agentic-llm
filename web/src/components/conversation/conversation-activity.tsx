import { History } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RelativeTime } from '@/components/relative-time'
import { StatusDot } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import type { Activity } from '@/lib/api'
import { activityTone, truncate } from '@/lib/format'
import { cn } from '@/lib/utils'

const VISIBLE = 8

/** The most useful line from an entry's details: why, what it concluded, or what they wrote. */
function detailLine(activity: Activity): string | null {
  const d = activity.details
  if (!d) return null
  for (const key of ['reason', 'summary'] as const) {
    const value = d[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  if (typeof d.body === 'string' && d.body.trim()) return `“${truncate(d.body.replace(/\s+/g, ' ').trim(), 140)}”`
  if (Array.isArray(d.reasons) && d.reasons.length) return d.reasons.filter((r) => typeof r === 'string').join('; ')
  return null
}

export interface ConversationActivityProps {
  threadId: string
  activity: Activity[]
}

/** The audit trail for one conversation, newest first. */
export function ConversationActivity({ threadId, activity }: ConversationActivityProps) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? activity : activity.slice(0, VISIBLE)

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Activity</CardTitle>
          <CardDescription>Everything recorded for this conversation, newest first.</CardDescription>
        </div>
        <Link
          to={`/app/activity?thread=${encodeURIComponent(threadId)}`}
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-mr-2 shrink-0' })}
        >
          Full log
        </Link>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState
            compact
            icon={History}
            title="Nothing recorded yet"
            description="Let the assistant decide. Every step it takes, and every edit or cancellation, is written here."
          />
        ) : (
          <>
            <ol className="flex flex-col">
              {shown.map((item, index) => {
                const detail = detailLine(item)
                const last = index === shown.length - 1
                return (
                  <li key={item.id} className={cn('relative flex gap-3', !last && 'pb-4')}>
                    {last ? null : <span aria-hidden className="absolute top-3.5 bottom-0 left-[3px] w-px bg-border" />}
                    <StatusDot tone={activityTone(item.action)} className="relative mt-[7px] size-[7px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <RelativeTime value={item.ts} title={item.ts_local} className="text-xs text-subtle tabular-nums" />
                      </div>
                      {detail ? <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted">{detail}</p> : null}
                    </div>
                  </li>
                )
              })}
            </ol>
            {activity.length > VISIBLE ? (
              <Button variant="ghost" size="sm" className="mt-3 -ml-2" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show fewer' : `Show all ${activity.length}`}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
