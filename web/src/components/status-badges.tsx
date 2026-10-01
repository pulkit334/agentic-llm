import type { ContactType, ConversationSummary, Decision, FollowUpStatus } from '@/lib/api'
import { CONVERSATION_STATE_META, FOLLOWUP_STATUS_META, contactTypeLabel, conversationState, decisionMeta } from '@/lib/format'
import { Badge, type BadgeProps } from './ui/badge'

type Extra = Omit<BadgeProps, 'tone' | 'children'>

/** Recipient type (customer / student / employee / business contact). Neutral outline: it is a label, not a status. */
export function ContactTypeBadge({ type, ...props }: { type: ContactType } & Extra) {
  return (
    <Badge tone="outline" {...props}>
      {contactTypeLabel(type)}
    </Badge>
  )
}

/** Outcome of an agent run. */
export function DecisionBadge({ decision, ...props }: { decision: Decision | null | undefined } & Extra) {
  const meta = decisionMeta(decision)
  return (
    <Badge tone={meta.tone} dot {...props}>
      {meta.label}
    </Badge>
  )
}

/** pending -> "Scheduled", sent -> "Sent", cancelled -> "Cancelled". */
export function FollowupStatusBadge({ status, ...props }: { status: FollowUpStatus } & Extra) {
  const meta = FOLLOWUP_STATUS_META[status]
  return (
    <Badge tone={meta.tone} dot {...props}>
      {meta.label}
    </Badge>
  )
}

/** Waiting on them / They replied / Follow-up scheduled / Closed. */
export function ConversationStatusBadge({ conversation, ...props }: { conversation: Pick<ConversationSummary, 'status' | 'pending_followup' | 'last_from'> } & Extra) {
  const meta = CONVERSATION_STATE_META[conversationState(conversation)]
  return (
    <Badge tone={meta.tone} dot {...props}>
      {meta.label}
    </Badge>
  )
}
