/**
 * Plain-language presentation of activity-log entries (action_log rows).
 *
 * The server already sends a readable `label` per action; this module adds what the label
 * alone does not say: an icon, a small outcome badge, a one-line summary pulled from the
 * entry's `details`, and a readable key/value view of those details.
 *
 * Action codes and detail shapes come from followup/tools.py, scheduler.py, agent.py,
 * rule_agent.py and api/routes_data.py on the backend branch.
 */
import {
  Bot,
  CalendarClock,
  CalendarX,
  CircleDot,
  FastForward,
  Inbox,
  Layers,
  Lock,
  MailX,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Reply,
  Scale,
  Send,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import type { Activity, Decision, RunMode } from '@/lib/api'
import {
  EMAIL_MODE_LABELS,
  RUN_MODE_LABELS,
  contactTypeLabel,
  decisionMeta,
  formatDateTime,
  formatHours,
  parseDate,
  pluralize,
  truncate,
  type Tone,
} from '@/lib/format'

/** The demo clock and the activity log are shown in the user's own time zone (serializers.CLOCK_TZ). */
export const ACTIVITY_TZ = 'Asia/Kolkata'

/* ------------------------------------------------------------------ small readers */

type Details = Record<string, unknown>

function str(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t ? t : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => str(v)).filter((v): v is string => Boolean(v))
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

function isRunMode(value: unknown): value is RunMode {
  return value === 'llm' || value === 'rules'
}

/* ------------------------------------------------------------------ times inside details */

/** "2026-10-03 03:30:00", "2026-10-03T03:30:00Z", ... (the backend stores naive UTC). */
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/
const DATETIME_IN_TEXT_RE = /\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|\s?UTC)?\b/g

export function isDateTimeString(value: unknown): value is string {
  return typeof value === 'string' && DATETIME_RE.test(value.trim())
}

/** A backend timestamp as "Sat 03 Oct, 09:00" in the activity time zone. */
export function formatLogTime(value: string): string {
  const date = parseDate(value.trim().replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : formatDateTime(date, ACTIVITY_TZ)
}

/** Replace raw UTC timestamps inside backend sentences ("... pending for 2026-10-03 03:30:00 UTC"). */
export function prettifyTimes(text: string): string {
  return text.replace(DATETIME_IN_TEXT_RE, (_match, day: string, time: string) => formatLogTime(`${day}T${time}:00Z`))
}

/** One backend phrase, cleaned up for display: capitalised, readable times. */
function sentence(text: string): string {
  return capitalize(prettifyTimes(text.trim()))
}

/** End a sentence with a full stop unless it already ends in punctuation. */
function withPeriod(text: string): string {
  return /[.!?…”"')]$/.test(text) ? text : `${text}.`
}

/* ------------------------------------------------------------------ icon + outcome badge */

export interface ActionBadge {
  label: string
  tone: Tone
}

export interface ActionMeta {
  icon: LucideIcon
  /** Small outcome marker next to the label; only for actions that end in a clear outcome. */
  badge?: ActionBadge
}

const ACTION_META: Record<string, ActionMeta> = {
  agent_run_started: { icon: Bot },
  agent_run_finished: { icon: Bot },
  conversation_saved: { icon: MessageSquareText },
  followup_scheduled: { icon: CalendarClock, badge: { label: 'Scheduled', tone: 'info' } },
  followup_rescheduled: { icon: CalendarClock, badge: { label: 'Rescheduled', tone: 'info' } },
  followup_blocked: { icon: ShieldAlert, badge: { label: 'Blocked', tone: 'danger' } },
  send_blocked: { icon: ShieldAlert, badge: { label: 'Blocked', tone: 'danger' } },
  email_sent: { icon: Send, badge: { label: 'Sent', tone: 'success' } },
  followup_sent: { icon: Send, badge: { label: 'Sent', tone: 'success' } },
  followup_send_failed: { icon: MailX, badge: { label: 'Failed', tone: 'danger' } },
  followup_cancelled: { icon: CalendarX, badge: { label: 'Cancelled', tone: 'neutral' } },
  followup_auto_cancelled: { icon: CalendarX, badge: { label: 'Cancelled', tone: 'neutral' } },
  followup_edited: { icon: Pencil },
  thread_closed: { icon: Lock },
  reply_received: { icon: Reply },
  reply_synced: { icon: Inbox },
  reply_sync: { icon: RefreshCw },
  clock_advanced: { icon: FastForward },
  batch_started: { icon: Layers },
  batch_finished: { icon: Layers },
}

export function actionMeta(action: string): ActionMeta {
  if (action.startsWith('decision:')) {
    const meta = decisionMeta(action.slice('decision:'.length) as Decision)
    return { icon: Scale, badge: { label: meta.label, tone: meta.tone } }
  }
  return ACTION_META[action] ?? { icon: CircleDot }
}

/* ------------------------------------------------------------------ one-line summary */

/**
 * The most useful fact in an entry's details, as one plain sentence (or null when the label
 * already says everything), e.g. "Due Sat 03 Oct, 09:00. Moved into the recipient's business hours."
 */
export function summarize(entry: Activity): string | null {
  const d: Details = entry.details ?? {}
  const action = entry.action

  if (action.startsWith('decision:')) {
    const reason = str(d.reason)
    return reason ? withPeriod(sentence(reason)) : null
  }

  switch (action) {
    case 'agent_run_started': {
      if (!isRunMode(d.mode)) return null
      return `${RUN_MODE_LABELS[d.mode]} mode${d.has_text ? ', working from pasted text' : ''}.`
    }
    case 'agent_run_finished':
      return str(d.summary)
    case 'conversation_saved': {
      const parts: string[] = []
      parts.push(d.new_thread ? 'New conversation' : 'Added to an existing conversation')
      const added = num(d.messages_added)
      if (added !== null) parts.push(`${pluralize(added, 'message')} stored`)
      const skipped = num(d.messages_skipped_as_duplicates)
      if (skipped) parts.push(`${pluralize(skipped, 'duplicate message')} skipped`)
      const type = str(d.type)
      if (type) parts.push(`contact type: ${contactTypeLabel(type).toLowerCase()}`)
      return `${parts.join(', ')}.`
    }
    case 'followup_scheduled':
    case 'followup_rescheduled': {
      const parts: string[] = []
      const sendAt = str(d.send_at)
      if (sendAt) parts.push(`Due ${isDateTimeString(sendAt) ? formatLogTime(sendAt) : sendAt}.`)
      for (const adjustment of strings(d.adjustments)) parts.push(withPeriod(sentence(adjustment)))
      return parts.length ? parts.join(' ') : null
    }
    case 'followup_blocked':
    case 'send_blocked': {
      const reasons = strings(d.reasons).map((r) => withPeriod(sentence(r)))
      return reasons.length ? reasons.join(' ') : null
    }
    case 'email_sent':
    case 'followup_sent': {
      if (str(d.status) === 'failed') return str(d.error) ? `Failed: ${withPeriod(str(d.error) as string)}` : 'The email tool reported a failure.'
      const to = str(d.delivered_to)
      if (!to) return null
      const what = action === 'followup_sent' ? 'Follow-up' : str(d.kind) === 'reply' ? 'Reply' : 'Email'
      return str(d.provider) === 'smtp' ? `${what} delivered to ${to} over SMTP.` : `${what} written to the mock outbox for ${to}.`
    }
    case 'followup_send_failed':
      return str(d.error) ? `${withPeriod(str(d.error) as string)} It stays scheduled and is retried on the next run.` : 'It stays scheduled and is retried on the next run.'
    case 'followup_cancelled':
    case 'followup_auto_cancelled':
    case 'thread_closed': {
      const reason = str(d.reason)
      return reason ? withPeriod(sentence(reason)) : null
    }
    case 'followup_edited': {
      const fields = strings(d.fields)
      const by = str(d.by)
      if (!fields.length) return by ? `Edited by ${by}.` : null
      return `${by ? `${by} changed` : 'Changed'} the ${fields.join(' and ')}.`
    }
    case 'reply_received': {
      const body = str(d.body)
      return body ? `“${truncate(body.replace(/\s+/g, ' '), 160)}”` : null
    }
    case 'reply_synced': {
      const from = str(d.from)
      return from ? `From ${from}.` : null
    }
    case 'reply_sync': {
      if (str(d.error)) return `The inbox check failed: ${str(d.error)}`
      const checked = num(d.checked)
      const added = num(d.added)
      if (checked === null && added === null) return null
      return `${pluralize(added ?? 0, 'new reply', 'new replies')} out of ${pluralize(checked ?? 0, 'message')} checked.`
    }
    case 'clock_advanced': {
      const hours = num(d.hours)
      const to = str(d.now)
      if (hours === null) return null
      return `Forward ${formatHours(hours)}${to && isDateTimeString(to) ? `, to ${formatLogTime(to)}` : ''}.`
    }
    case 'batch_started': {
      const threads = Array.isArray(d.threads) ? d.threads.length : null
      const mode = isRunMode(d.mode) ? ` in ${RUN_MODE_LABELS[d.mode]} mode` : ''
      return threads !== null ? `${pluralize(threads, 'conversation')}${mode}.` : null
    }
    case 'batch_finished': {
      const seconds = num(d.seconds)
      return seconds !== null ? `Took ${seconds.toFixed(1)} seconds.` : null
    }
    default:
      return null
  }
}

/* ------------------------------------------------------------------ details view */

export type DetailValue =
  | { kind: 'text'; text: string; mono?: boolean; block?: boolean }
  | { kind: 'list'; items: string[] }
  | { kind: 'code'; text: string }

export interface DetailRow {
  key: string
  label: string
  value: DetailValue
}

const KEY_LABELS: Record<string, string> = {
  adjustments: 'Time adjustments',
  added: 'New replies',
  body: 'Message',
  by: 'By',
  checked: 'Messages checked',
  contact: 'Contact',
  decision: 'Decision',
  decisions: 'Decisions',
  delivered_to: 'Delivered to',
  duplicates: 'Duplicates',
  error: 'Error',
  errors: 'Errors',
  fields: 'Changed',
  followup_id: 'Follow-up',
  from: 'From',
  has_text: 'From pasted text',
  hours: 'Moved forward',
  key_points: 'Key points',
  kind: 'Kind',
  message_id: 'Message',
  messages_added: 'Messages stored',
  messages_skipped_as_duplicates: 'Duplicates skipped',
  mode: 'Mode',
  model: 'Model',
  new_thread: 'New conversation',
  now: 'New time',
  outbox_id: 'Outbox entry',
  provider: 'Email tool',
  reason: 'Reason',
  reasons: 'Blocked because',
  requested_send_at: 'Requested time',
  seconds: 'Duration',
  send_at: 'Send time',
  since: 'Since',
  status: 'Status',
  summary: 'Summary',
  thread_id: 'Conversation',
  threads: 'Conversations',
  type: 'Contact type',
  user_id: 'User',
  workers: 'Parallel workers',
}

function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? capitalize(key.replace(/_/g, ' '))
}

const ID_KEYS = new Set(['followup_id', 'outbox_id', 'message_id', 'user_id'])
const MONO_KEYS = new Set(['model', 'thread_id', 'contact', 'delivered_to', 'from'])

function scalarText(key: string, value: unknown): DetailValue {
  if (value === null || value === undefined || value === '') return { kind: 'text', text: 'None' }
  if (typeof value === 'boolean') return { kind: 'text', text: value ? 'Yes' : 'No' }

  if (ID_KEYS.has(key) && (typeof value === 'number' || typeof value === 'string')) return { kind: 'text', text: `#${value}`, mono: true }
  if (key === 'mode' && isRunMode(value)) return { kind: 'text', text: RUN_MODE_LABELS[value] }
  if (key === 'decision' && typeof value === 'string') return { kind: 'text', text: decisionMeta(value as Decision).label }
  if (key === 'type' && typeof value === 'string') return { kind: 'text', text: contactTypeLabel(value) }
  if (key === 'provider' && typeof value === 'string') return { kind: 'text', text: (EMAIL_MODE_LABELS as Record<string, string>)[value] ?? value }
  if (key === 'kind' && typeof value === 'string') return { kind: 'text', text: value === 'reply' ? 'Reply' : value === 'followup' ? 'Follow-up' : capitalize(value) }
  if (key === 'status' && typeof value === 'string') return { kind: 'text', text: capitalize(value) }
  if (key === 'hours' && typeof value === 'number') return { kind: 'text', text: formatHours(value) }
  if (key === 'seconds' && typeof value === 'number') return { kind: 'text', text: `${value.toFixed(1)} seconds` }

  if (isDateTimeString(value)) return { kind: 'text', text: formatLogTime(value) }
  if (typeof value === 'number') return { kind: 'text', text: String(value), mono: true }

  const text = typeof value === 'string' ? prettifyTimes(value) : String(value)
  const block = text.length > 90 || text.includes('\n')
  return { kind: 'text', text, block, mono: MONO_KEYS.has(key) && !block }
}

function detailValue(key: string, value: unknown): DetailValue {
  if (Array.isArray(value)) {
    if (!value.length) return { kind: 'text', text: 'None' }
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return { kind: 'list', items: value.map((v) => (typeof v === 'string' ? sentence(v) : String(v))) }
    }
    return { kind: 'code', text: JSON.stringify(value, null, 2) }
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (!entries.length) return { kind: 'text', text: 'None' }
    if (entries.every(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) {
      return { kind: 'list', items: entries.map(([k, v]) => `${keyLabel(k)}: ${v === null ? 'None' : String(v)}`) }
    }
    return { kind: 'code', text: JSON.stringify(value, null, 2) }
  }
  return scalarText(key, value)
}

/** Every key in an entry's details as a labelled, readable value (server order). */
export function detailRows(entry: Activity): DetailRow[] {
  const details = entry.details
  if (!details) return []
  return Object.entries(details).map(([key, value]) => ({ key, label: keyLabel(key), value: detailValue(key, value) }))
}

/* ------------------------------------------------------------------ grouping */

/** Actions that belong to an agent run (as opposed to the scheduler or a batch). */
const AGENT_ACTIONS = new Set(['agent_run_started', 'agent_run_finished', 'conversation_saved'])
const SCHEDULER_ACTIONS = new Set(['clock_advanced', 'followup_sent', 'followup_auto_cancelled', 'followup_send_failed', 'reply_sync'])

export type RunKind = 'agent' | 'scheduler' | 'batch'

/** Bookkeeping rows that the run header already represents; hidden from the run's step list. */
export const RUN_HEADER_ACTIONS = new Set(['agent_run_started', 'agent_run_finished', 'clock_advanced', 'batch_started', 'batch_finished'])

export function runKind(entries: Activity[]): RunKind | null {
  if (entries.some((e) => AGENT_ACTIONS.has(e.action) || e.action.startsWith('decision:'))) return 'agent'
  if (entries.some((e) => e.action.startsWith('batch_'))) return 'batch'
  if (entries.some((e) => SCHEDULER_ACTIONS.has(e.action))) return 'scheduler'
  return null
}

export type FeedNode = { kind: 'entry'; key: string; entry: Activity } | { kind: 'run'; key: string; runId: string; runKind: RunKind; entries: Activity[] }

/**
 * Group consecutive entries of the same run (newest first, as the API returns them).
 * A run is shown as one block when it has more than one entry, or when it is an agent run.
 * `entries` inside a run are oldest first, so a run reads in the order it happened.
 */
export function buildFeed(items: Activity[]): FeedNode[] {
  const nodes: FeedNode[] = []
  let i = 0
  while (i < items.length) {
    const runId = items[i].run_id
    let j = i + 1
    if (runId) while (j < items.length && items[j].run_id === runId) j++
    const slice = items.slice(i, j)
    const kind = runId ? runKind(slice) : null
    if (runId && kind && (slice.length > 1 || kind === 'agent')) {
      nodes.push({ kind: 'run', key: `run-${runId}-${slice[0].id}`, runId, runKind: kind, entries: [...slice].reverse() })
    } else {
      for (const entry of slice) nodes.push({ kind: 'entry', key: `entry-${entry.id}`, entry })
    }
    i = j
  }
  return nodes
}

/** Newest timestamp of a feed node (for day grouping). */
export function nodeTimestamp(node: FeedNode): string {
  return node.kind === 'entry' ? node.entry.ts : node.entries[node.entries.length - 1].ts
}

/* ------------------------------------------------------------------ days */

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: ACTIVITY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { timeZone: ACTIVITY_TZ, weekday: 'long', day: 'numeric', month: 'long' })

/** "2026-10-01" in the activity time zone. */
export function dayKey(value: string | Date): string {
  return DAY_KEY.format(parseDate(value))
}

/** "Today", "Yesterday", "Tomorrow" (the simulated clock can be behind real send times) or "Tuesday 29 September". */
export function dayLabel(value: string | Date, now: Date): string {
  const key = dayKey(value)
  if (key === dayKey(now)) return 'Today'
  const day = 24 * 60 * 60 * 1000
  if (key === dayKey(new Date(now.getTime() - day))) return 'Yesterday'
  if (key === dayKey(new Date(now.getTime() + day))) return 'Tomorrow'
  return DAY_LABEL.format(parseDate(value))
}

/** "11:00" from a "Thu 01 Oct, 11:00" local string. */
export function timeOfDay(local: string): string {
  const parts = local.split(', ')
  return parts[parts.length - 1] ?? local
}
