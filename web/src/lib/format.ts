/**
 * Formatting helpers and the plain-language vocabulary of the app.
 *
 * Relative times are always measured against the SIMULATED demo clock (see `useNow()` in
 * src/lib/queries.ts), never `Date.now()`, because the demo fast-forwards time.
 */
import type {
  AgentStep,
  ContactType,
  ConversationSummary,
  Decision,
  FollowUpStatus,
  RunMode,
} from './api'

/* ------------------------------------------------------------------ dates */

/** Parse an API timestamp. Naive ISO strings (no zone) are treated as UTC. */
export function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasZone ? value : `${value}Z`)
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

/**
 * "in 1 day", "3 hours ago", "in 20 minutes", "just now".
 * @param now the simulated current time (from useNow()).
 */
export function formatRelative(value: string | Date, now: Date): string {
  const diffMs = parseDate(value).getTime() - now.getTime()
  const sign = diffMs < 0 ? -1 : 1
  const seconds = Math.abs(diffMs) / 1000
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return RTF.format(sign * Math.max(minutes, 1), 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return RTF.format(sign * hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 30) return RTF.format(sign * days, 'day')
  const months = Math.round(days / 30)
  if (months < 12) return RTF.format(sign * months, 'month')
  return RTF.format(sign * Math.round(days / 365), 'year')
}

/** A span of hours in words: "40 minutes", "20 hours", "3 days". */
export function formatHours(hours: number): string {
  const h = Math.max(hours, 0)
  if (h < 1) {
    const minutes = Math.max(Math.round(h * 60), 1)
    return pluralize(minutes, 'minute')
  }
  if (h < 48) return pluralize(Math.round(h), 'hour')
  return pluralize(Math.round(h / 24), 'day')
}

/** Compact countdown to a future time: "2d 4h", "3h 20m", "12m", or "due now". */
export function formatCountdown(value: string | Date, now: Date): string {
  const ms = parseDate(value).getTime() - now.getTime()
  if (ms <= 0) return 'due now'
  const totalMinutes = Math.round(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  return `${Math.max(minutes, 1)}m`
}

/**
 * Absolute date-time in a time zone: "Thu 01 Oct, 11:00".
 * Prefer the server's `*_local` strings when present; use this for client-side values.
 */
export function formatDateTime(value: string | Date, timeZone = 'Asia/Kolkata'): string {
  const d = parseDate(value)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`
}

/** Short time-zone label: "Asia/Kolkata" -> "Kolkata", "America/New_York" -> "New York". */
export function formatTimeZone(tz: string): string {
  const city = tz.split('/').pop() ?? tz
  return city.replace(/_/g, ' ')
}

/* ------------------------------------------------------------------ words */

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function firstName(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  return n ? n.split(/\s+/)[0] : 'them'
}

/** Possessive first name: "Rahul's", "James'". */
export function possessive(name: string | null | undefined): string {
  const first = firstName(name)
  return first.endsWith('s') ? `${first}'` : `${first}'s`
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]
  return letters.toUpperCase()
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/* ------------------------------------------------------------------ tones */

/** Status tone used by Badge. Colour is reserved for these small status markers. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/** Background class for a small status dot of each tone (e.g. next to an activity entry). */
export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-subtle',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/* ------------------------------------------------------------------ contact types */

export const CONTACT_TYPES: ContactType[] = ['customer', 'student', 'employee', 'business']

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  customer: 'Customer',
  student: 'Student',
  employee: 'Employee',
  business: 'Business contact',
}

export function contactTypeLabel(type: ContactType | string): string {
  return CONTACT_TYPE_LABELS[type as ContactType] ?? type
}

/* ------------------------------------------------------------------ decisions */

export interface DecisionMeta {
  label: string
  tone: Tone
  /** One plain sentence describing the outcome. */
  description: string
}

export const DECISION_META: Record<Decision, DecisionMeta> = {
  scheduled: { label: 'Follow-up scheduled', tone: 'info', description: 'A follow-up is queued and will go out at the chosen time.' },
  sent_now: { label: 'Sent now', tone: 'success', description: 'An email went out right away.' },
  replied: { label: 'Replied', tone: 'success', description: 'They asked something, so the assistant answered instead of chasing.' },
  skipped: { label: 'No follow-up needed', tone: 'warning', description: 'Nothing to send right now.' },
  blocked_duplicate: { label: 'Duplicate blocked', tone: 'danger', description: 'A follow-up is already pending, so a second one was not created.' },
  closed: { label: 'Conversation closed', tone: 'neutral', description: 'They opted out or declined, so the conversation was closed.' },
}

export function decisionMeta(decision: Decision | null | undefined): DecisionMeta {
  if (decision && decision in DECISION_META) return DECISION_META[decision]
  return { label: 'No decision', tone: 'neutral', description: 'The run ended without recording a decision.' }
}

/* ------------------------------------------------------------------ follow-up status */

export const FOLLOWUP_STATUS_META: Record<FollowUpStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Scheduled', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

/* ------------------------------------------------------------------ conversation state */

export type ConversationState = 'waiting' | 'replied' | 'scheduled' | 'closed'

export const CONVERSATION_STATE_META: Record<ConversationState, { label: string; tone: Tone }> = {
  waiting: { label: 'Waiting on them', tone: 'neutral' },
  replied: { label: 'They replied', tone: 'warning' },
  scheduled: { label: 'Follow-up scheduled', tone: 'info' },
  closed: { label: 'Closed', tone: 'neutral' },
}

/** Which of the four list states a conversation is in. */
export function conversationState(c: Pick<ConversationSummary, 'status' | 'pending_followup' | 'last_from'>): ConversationState {
  if (c.status === 'closed') return 'closed'
  if (c.pending_followup) return 'scheduled'
  if (c.last_from === 'them') return 'replied'
  return 'waiting'
}

/** One plain sentence about where a conversation stands, e.g. "Waiting 20 hours for Rahul's reply". */
export function conversationHeadline(c: ConversationSummary): string {
  const name = firstName(c.contact.name)
  switch (conversationState(c)) {
    case 'closed':
      return 'Conversation closed'
    case 'scheduled':
      return `Follow-up to ${name} scheduled for ${c.pending_followup?.send_at_local}`
    case 'replied':
      return c.waiting_hours != null ? `${name} replied ${formatHours(c.waiting_hours)} ago` : `${name} replied`
    case 'waiting':
      return c.waiting_hours != null ? `Waiting ${formatHours(c.waiting_hours)} for ${possessive(c.contact.name)} reply` : `Waiting for ${possessive(c.contact.name)} reply`
  }
}

/* ------------------------------------------------------------------ agent runs */

export const RUN_MODE_LABELS: Record<RunMode, string> = {
  llm: 'Smart AI',
  rules: 'Rules',
}

export const RUN_MODE_DESCRIPTIONS: Record<RunMode, string> = {
  llm: 'Claude reads the thread, reasons about it and writes the email.',
  rules: 'Built-in rules and templates. Fast, offline and predictable.',
}

/** The seven steps of a run, in order, as shown in the live timeline. */
export const AGENT_STEPS: { id: AgentStep; label: string }[] = [
  { id: 'read', label: 'Reading the conversation' },
  { id: 'history', label: 'Checking earlier emails' },
  { id: 'decide', label: 'Deciding' },
  { id: 'timing', label: 'Choosing the time' },
  { id: 'draft', label: 'Writing the email' },
  { id: 'act', label: 'Scheduling' },
  { id: 'record', label: 'Recording' },
]

export const AGENT_STEP_LABELS: Record<AgentStep, string> = Object.fromEntries(
  AGENT_STEPS.map((s) => [s.id, s.label]),
) as Record<AgentStep, string>

/** Plain names for the agent's tools, for the technical trace. */
export const TOOL_LABELS: Record<string, string> = {
  save_conversation: 'Save conversation',
  get_contact: 'Look up contact',
  get_thread_history: 'Read thread history',
  list_followups: 'List earlier follow-ups',
  get_strategy: 'Get strategy and timing',
  schedule_followup: 'Schedule follow-up',
  send_email_now: 'Send email now',
  lookup_faq: 'Search FAQ',
  cancel_followup: 'Cancel follow-up',
  close_thread: 'Close conversation',
  record_decision: 'Record decision',
}

/* ------------------------------------------------------------------ activity */

/** Tone for an activity action code (for a small dot or badge next to the label). */
export function activityTone(action: string): Tone {
  if (action.startsWith('decision:')) return decisionMeta(action.slice('decision:'.length) as Decision).tone
  if (/(blocked|failed)/.test(action)) return 'danger'
  if (/(cancelled|closed)/.test(action)) return 'neutral'
  if (/(sent)/.test(action)) return 'success'
  if (/(scheduled|rescheduled|edited)/.test(action)) return 'info'
  if (/(reply_received|reply_synced)/.test(action)) return 'warning'
  return 'neutral'
}

export const EMAIL_MODE_LABELS: Record<'mock' | 'smtp', string> = {
  mock: 'Mock outbox',
  smtp: 'SMTP',
}
