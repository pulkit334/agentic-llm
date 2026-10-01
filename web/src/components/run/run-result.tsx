import { ArrowRight, CalendarClock, Send } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RelativeTime } from '@/components/relative-time'
import { DecisionBadge, FollowupStatusBadge } from '@/components/status-badges'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import type { AgentEvent, FollowUp, RunResult } from '@/lib/api'
import { RUN_MODE_LABELS, decisionMeta, formatTimeZone } from '@/lib/format'
import { useConversation } from '@/lib/queries'
import { EmailPreview } from './email-preview'
import { FollowupActions } from './followup-actions'
import { decisionInfo, sentenceCase } from './steps'

/** One line under the email: when the follow-up goes (or went) out, against the simulated clock. */
function SendTimeLine({ followup }: { followup: FollowUp }) {
  if (followup.status === 'sent') {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FollowupStatusBadge status="sent" size="sm" />
        <span>
          Went out <span className="text-foreground">{followup.done_at_local ?? followup.send_at_local}</span>
        </span>
      </span>
    )
  }
  if (followup.status === 'cancelled') {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FollowupStatusBadge status="cancelled" size="sm" />
        <span>{followup.cancel_reason ? sentenceCase(followup.cancel_reason) : 'It will not be sent.'}</span>
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <CalendarClock aria-hidden className="size-4 shrink-0 text-subtle" />
      <span>
        Goes out <span className="font-medium text-foreground">{followup.send_at_local}</span> {formatTimeZone(followup.contact.timezone)} time
      </span>
      <span aria-hidden className="text-subtle">
        ·
      </span>
      <RelativeTime value={followup.send_at} title={followup.send_at_local} className="text-foreground" />
    </span>
  )
}

function recipient(followup: FollowUp) {
  return (
    <>
      {followup.contact.name} <span className="text-muted">&lt;{followup.contact.email}&gt;</span>
    </>
  )
}

export interface RunResultViewProps {
  result: RunResult
  events: AgentEvent[]
  /** Add an "Open conversation" link (used on the New follow-up page). */
  linkToConversation?: boolean
}

/**
 * What the run decided and why, the email it drafted or sent, and when it goes out.
 * A scheduled follow-up is read live from the conversation, so edits and cancellations show here.
 */
export function RunResultView({ result, events, linkToConversation }: RunResultViewProps) {
  const { data: conversation } = useConversation(result.thread_id ?? undefined)
  const info = decisionInfo(events)
  const meta = decisionMeta(result.decision)
  const scheduledId = result.followup?.id
  const followup = scheduledId === undefined ? null : (conversation?.followups.find((f) => f.id === scheduledId) ?? result.followup)

  const conversationLink =
    linkToConversation && result.thread_id ? (
      <Link to={`/app/conversations/${encodeURIComponent(result.thread_id)}`} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
        Open conversation
        <ArrowRight aria-hidden />
      </Link>
    ) : null

  if (!result.decision) {
    return (
      <div className="space-y-3">
        <Alert tone="danger" title="The assistant could not finish">
          {result.summary || 'It stopped without recording a decision. Anything it did is in the activity log.'}
        </Alert>
        {conversationLink}
      </div>
    )
  }

  const reason = info?.reason ? sentenceCase(info.reason) : meta.description
  const keyPoints = info?.keyPoints ?? []

  let email: ReactNode = null
  if (followup) {
    const blocked = result.decision === 'blocked_duplicate'
    email = (
      <EmailPreview
        draft={followup.status === 'pending'}
        label={blocked ? 'Already scheduled, so no second follow-up was created' : 'Drafted follow-up'}
        to={recipient(followup)}
        subject={followup.subject}
        body={followup.body}
        footer={<SendTimeLine followup={followup} />}
      />
    )
  } else if (result.email) {
    email = (
      <EmailPreview
        label="Sent email"
        to={result.email.to}
        subject={result.email.subject}
        body={result.email.body}
        footer={
          <span className="flex items-center gap-1.5">
            <Send aria-hidden className="size-4 shrink-0 text-subtle" />
            Sent right away
          </span>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DecisionBadge decision={result.decision} />
        <Badge tone="outline" size="sm">
          {RUN_MODE_LABELS[result.mode]}
        </Badge>
        {result.run_id ? (
          <span className="ml-auto font-mono text-xs text-subtle" title="Run id in the activity log">
            run {result.run_id}
          </span>
        ) : null}
      </div>

      <p className="text-base text-foreground">{result.summary || meta.description}</p>

      <div>
        <h3 className="text-xs font-medium text-muted">Why</h3>
        <p className="mt-1 text-sm break-words text-foreground">{reason}</p>
        {keyPoints.length ? (
          <ul aria-label="What the assistant considered" className="mt-2 space-y-1">
            {keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm break-words text-muted">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-subtle" />
                {point}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {email}

      {followup?.status === 'pending' || conversationLink ? (
        <div className="flex flex-wrap items-center gap-2">
          {conversationLink}
          {followup ? <FollowupActions followup={followup} /> : null}
        </div>
      ) : null}
    </div>
  )
}
