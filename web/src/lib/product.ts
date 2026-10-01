/**
 * Static product facts shared by the public landing page and the in-app walkthrough.
 *
 * These mirror the backend source of truth (followup/strategies.py, followup/guards.py,
 * followup/tools.py). Signed-in pages that show live values should prefer GET /api/strategies.
 */
import type { ContactType, Strategy } from './api'

export const PROJECT = {
  name: 'Followup',
  team: 'AGT-018',
  problem: 'PS-053',
  event: 'Agenticthon 2026',
  repoUrl: 'https://github.com/pulkit334/agentic-llm',
} as const

/** followup/strategies.py STRATEGIES */
export const STRATEGIES: Record<ContactType, Strategy> = {
  customer: {
    delay_hours: 48,
    max_followups: 3,
    tone: 'warm, helpful, low-pressure',
    focus: 'remind them of the value, answer likely objections, make the next step a one-line reply',
    length: '60-110 words',
  },
  student: {
    delay_hours: 24,
    max_followups: 2,
    tone: 'clear, encouraging, supportive',
    focus: 'the deadline and the exact action needed; offer help if they are stuck',
    length: '50-90 words',
    deadline_lead_hours: 24,
  },
  employee: {
    delay_hours: 24,
    max_followups: 2,
    tone: 'direct, polite, brief',
    focus: 'the task, the owner, and the due date; ask for a status update or blocker',
    length: '30-70 words',
    deadline_lead_hours: 24,
  },
  business: {
    delay_hours: 96,
    max_followups: 2,
    tone: 'formal and professional',
    focus: 'the proposal or meeting; offer two concrete time slots or a clear next step',
    length: '70-120 words',
  },
}

/** Minimum hours between two of our messages in one conversation. */
export const MIN_GAP_HOURS = 24
/** Student/employee deadline reminders may shrink the gap to this when 24 h would land after the deadline. */
export const DEADLINE_MIN_GAP_HOURS = 12
/** Recipient-local sending window. */
export const BUSINESS_HOURS = 'Mon–Fri, 09:00–18:00 in the recipient’s time zone'

/** followup/guards.py CLOSING_PHRASES: any of these in their last message closes the conversation. */
export const OPT_OUT_PHRASES = [
  'not interested',
  'unsubscribe',
  'stop emailing',
  'remove me',
  'no longer need',
  'we went with another',
  'decided to go with',
  "please don't contact",
]

export interface Safeguard {
  id: string
  title: string
  description: string
}

/** The hard rules enforced in code (guards.check and scheduler.run_due), not left to the model. */
export const SAFEGUARDS: Safeguard[] = [
  {
    id: 'one-pending',
    title: 'One pending follow-up per conversation',
    description: 'A second follow-up is blocked while one is already queued, so a conversation never gets a duplicate.',
  },
  {
    id: 'no-chase-after-reply',
    title: 'Never chases after a reply',
    description: 'If they wrote last, the assistant answers them instead of sending a reminder.',
  },
  {
    id: 'opt-outs',
    title: 'Respects opt-outs',
    description: 'Phrases like “not interested” or “unsubscribe” close the conversation and cancel anything queued.',
  },
  {
    id: 'max-per-type',
    title: 'A cap per recipient type',
    description: 'Customers get at most 3 follow-ups; students, employees and business contacts at most 2.',
  },
  {
    id: 'min-gap',
    title: `At least ${MIN_GAP_HOURS} hours between emails`,
    description: `Never two of our messages within ${MIN_GAP_HOURS} hours. A student or employee deadline reminder may use ${DEADLINE_MIN_GAP_HOURS} hours, only when that is the only way to land before the deadline.`,
  },
  {
    id: 'business-hours',
    title: 'Business hours only',
    description: 'Send times move into Monday to Friday, 09:00 to 18:00, in the recipient’s own time zone.',
  },
  {
    id: 'recheck',
    title: 'Re-checks right before sending',
    description: 'At send time the conversation is checked again: a reply, an opt-out or a closed thread cancels the follow-up.',
  },
  {
    id: 'identical-text',
    title: 'No repeated wording',
    description: 'A message identical to one already sent in the conversation is blocked.',
  },
]

export interface AgentTool {
  name: string
  purpose: string
  /** Changes data (as opposed to read-only). */
  writes: boolean
}

/** followup/tools.py TOOL_SCHEMAS, in workflow order. */
export const AGENT_TOOLS: AgentTool[] = [
  { name: 'save_conversation', purpose: 'Stores a pasted conversation, its contact and messages, skipping duplicates.', writes: true },
  { name: 'get_contact', purpose: 'Looks up the contact’s name, type, time zone and other threads.', writes: false },
  { name: 'get_thread_history', purpose: 'Reads every message plus who wrote last and what is already pending.', writes: false },
  { name: 'list_followups', purpose: 'Lists earlier follow-ups to this contact across all conversations.', writes: false },
  { name: 'lookup_faq', purpose: 'Finds documented answers so replies never guess.', writes: false },
  { name: 'get_strategy', purpose: 'Returns tone, length, focus and a suggested send time for the contact type.', writes: false },
  { name: 'schedule_followup', purpose: 'Queues the drafted follow-up after the safeguards approve the time.', writes: true },
  { name: 'send_email_now', purpose: 'Sends right away, usually to answer a question.', writes: true },
  { name: 'cancel_followup', purpose: 'Cancels a pending follow-up with a reason.', writes: true },
  { name: 'close_thread', purpose: 'Closes the conversation and cancels anything pending.', writes: true },
  { name: 'record_decision', purpose: 'Writes the final decision and its reasons to the audit log.', writes: true },
]
