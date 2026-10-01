/** Pure helpers for the Overview page. */
import type { Activity, ConversationSummary } from '@/lib/api'
import { conversationState, formatHours, parseDate } from '@/lib/format'

/**
 * Open conversations with no follow-up queued: the assistant has not decided anything that is
 * still pending, so someone should open them and let it decide. Conversations where they wrote
 * last come first (they are waiting on us), then the longest silences.
 */
export function needsAttention(conversations: ConversationSummary[]): ConversationSummary[] {
  return conversations
    .filter((c) => c.status === 'open' && !c.pending_followup)
    .sort((a, b) => {
      const repliedA = conversationState(a) === 'replied' ? 1 : 0
      const repliedB = conversationState(b) === 'replied' ? 1 : 0
      if (repliedA !== repliedB) return repliedB - repliedA
      return (b.waiting_hours ?? 0) - (a.waiting_hours ?? 0)
    })
}

/** The earliest pending follow-up across all conversations, or null when none is queued. */
export function nextScheduledSend(conversations: ConversationSummary[]): Date | null {
  let next: Date | null = null
  for (const c of conversations) {
    if (!c.pending_followup) continue
    const at = parseDate(c.pending_followup.send_at)
    if (!next || at < next) next = at
  }
  return next
}

/** Who/what an activity entry is about: "Rahul Mehta · Quote for 50 CRM licenses", or a detail for thread-less entries. */
export function activityContext(activity: Activity): string | null {
  const parts = [activity.contact_name, activity.subject].filter((p): p is string => Boolean(p))
  if (parts.length) return parts.join(' · ')
  const hours = activity.details?.hours
  if (activity.action === 'clock_advanced' && typeof hours === 'number') return `Moved forward ${formatHours(hours)}`
  return null
}

/** The recorded reason behind a decision, cancellation or close, when there is one. */
export function activityReason(activity: Activity): string | null {
  const reason = activity.details?.reason
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null
}
