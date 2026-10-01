import { CalendarClock, CalendarX, MessagesSquare, Send, type LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FollowUpList, FollowUpListSkeleton } from '@/components/followup'
import { NewFollowUpLink } from '@/components/new-followup-link'
import { summarizeDue } from '@/components/layout/DemoClock'
import { Alert, Badge, Button, EmptyState, InlineError, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, buttonVariants, toast } from '@/components/ui'
import { errorMessage, type FollowUp, type FollowUpStatus } from '@/lib/api'
import { parseDate, pluralize } from '@/lib/format'
import { useFollowups, useNow, useRunDue } from '@/lib/queries'

const TABS: { value: FollowUpStatus; label: string; listLabel: string; caption: string }[] = [
  {
    value: 'pending',
    label: 'Pending',
    listLabel: 'Pending follow-ups',
    caption: 'Soonest first. Send times are in each contact’s time zone; countdowns follow the demo clock.',
  },
  { value: 'sent', label: 'Sent', listLabel: 'Sent follow-ups', caption: 'Most recent first.' },
  { value: 'cancelled', label: 'Cancelled', listLabel: 'Cancelled follow-ups', caption: 'Most recent first.' },
]

function isStatus(value: string | null): value is FollowUpStatus {
  return value === 'pending' || value === 'sent' || value === 'cancelled'
}

/** The follow-up queue: pending (with countdowns, Edit, Cancel), sent and cancelled, one tab each. */
export default function Scheduled() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('status')
  const tab: FollowUpStatus = isStatus(requested) ? requested : 'pending'
  const followups = useFollowups()

  // One request for all three tabs (so every tab shows its count); the API already orders
  // pending soonest first and finished ones most recent first.
  const groups = useMemo(() => {
    const byStatus: Record<FollowUpStatus, FollowUp[]> = { pending: [], sent: [], cancelled: [] }
    for (const followup of followups.data ?? []) byStatus[followup.status]?.push(followup)
    return byStatus
  }, [followups.data])

  const showTab = (value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'pending') next.delete('status')
        else next.set('status', value)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled"
        description="Follow-ups the assistant has queued, and what became of them. Each one is checked against the conversation again just before it goes out."
        actions={
          <NewFollowUpLink />
        }
      />

      <Tabs value={tab} onValueChange={showTab}>
        <TabsList aria-label="Follow-up status">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {followups.data ? (
                <Badge size="sm" mono>
                  {groups[t.value].length}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="space-y-4">
            {followups.isPending ? (
              <FollowUpListSkeleton label={`Loading ${t.listLabel.toLowerCase()}`} />
            ) : followups.isError && !followups.data ? (
              <InlineError error={followups.error} title="Could not load follow-ups" onRetry={() => void followups.refetch()} />
            ) : groups[t.value].length === 0 ? (
              <EmptyTab status={t.value} hasPending={groups.pending.length > 0} onShowPending={() => showTab('pending')} />
            ) : (
              <>
                {t.value === 'pending' ? <DueNotice pending={groups.pending} /> : null}
                <p className="text-sm text-muted">{t.caption}</p>
                <FollowUpList followups={groups[t.value]} label={t.listLabel} titleAs="h2" showStatus={false} />
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

/** Pending follow-ups whose send time has passed on the demo clock, with a way to send them now. */
function DueNotice({ pending }: { pending: FollowUp[] }) {
  const now = useNow()
  const runDue = useRunDue()
  const due = pending.filter((f) => parseDate(f.send_at).getTime() <= now.getTime()).length
  if (!due) return null

  // mutateAsync: once everything due is sent this notice (or the whole pending list) unmounts,
  // and per-call callbacks would never run.
  const onSend = () => {
    runDue
      .mutateAsync()
      .then((res) =>
        toast(
          res.results.length
            ? { title: 'Due follow-ups processed', description: summarizeDue(res.results), tone: 'success' }
            : { title: 'Nothing was due', description: 'No pending follow-up has reached its send time yet.' },
        ),
      )
      .catch((error: unknown) => toast.error('Could not send due follow-ups', errorMessage(error)))
  }

  return (
    <Alert
      tone="info"
      title={due === 1 ? '1 follow-up has reached its send time' : `${pluralize(due, 'follow-up')} have reached their send time`}
      action={
        <Button size="sm" variant="primary" loading={runDue.isPending} onClick={onSend}>
          {runDue.isPending ? null : <Send aria-hidden />}
          Send due now
        </Button>
      }
    >
      Before anything goes out, the assistant checks the conversation once more. If the contact replied or opted out, the follow-up is cancelled
      instead.
    </Alert>
  )
}

function EmptyTab({ status, hasPending, onShowPending }: { status: FollowUpStatus; hasPending: boolean; onShowPending: () => void }) {
  const viewPending = hasPending ? (
    <Button onClick={onShowPending}>
      <CalendarClock aria-hidden />
      View pending
    </Button>
  ) : (
    <NewFollowUpLink />
  )

  const content: Record<FollowUpStatus, { icon: LucideIcon; title: string; description: string; action: ReactNode }> = {
    pending: {
      icon: CalendarClock,
      title: 'Nothing scheduled',
      description: 'When the assistant decides a conversation needs a nudge, the follow-up waits here until its send time.',
      action: (
        <>
          <NewFollowUpLink />
          <Link to="/app/conversations" className={buttonVariants()}>
            <MessagesSquare aria-hidden />
            View conversations
          </Link>
        </>
      ),
    },
    sent: {
      icon: Send,
      title: 'No follow-ups sent yet',
      description: hasPending
        ? 'Pending follow-ups go out at their send time. Move the demo clock forward to send the next one.'
        : 'Follow-ups appear here once they go out. Start by letting the assistant look at a conversation.',
      action: viewPending,
    },
    cancelled: {
      icon: CalendarX,
      title: 'Nothing cancelled',
      description: 'A follow-up is cancelled when a reply arrives before its send time, when the contact opts out, or when you cancel it yourself.',
      action: viewPending,
    },
  }

  const { icon, title, description, action } = content[status]
  return <EmptyState icon={icon} title={title} description={description} action={action} />
}
