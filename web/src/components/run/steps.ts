/**
 * Turns the agent's raw event stream into the seven plain-language steps of the live timeline,
 * plus the bits of a run the result card needs (the recorded reason, whether Smart AI fell back).
 *
 * The server tags each event with the workflow step it belongs to (see api/routes_agent.py):
 *   read -> history -> decide -> timing -> draft -> act -> record
 * Events do not always arrive in that order: the agent states its plan before it reads anything,
 * and re-checks the safeguards (a "decide" event) after it has chosen a time. So the timeline keeps
 * a high-water mark: it only moves forward, and later events for an earlier step just update that
 * step's detail line.
 */
import type { AgentEvent, AgentStep, Decision, RunResult } from '@/lib/api'
import { AGENT_STEPS, TOOL_LABELS, contactTypeLabel, decisionMeta, firstName, formatHours, pluralize } from '@/lib/format'

export type RunPhase = 'idle' | 'running' | 'done' | 'failed'

export type StepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'failed'

export interface StepView {
  id: AgentStep
  label: string
  status: StepStatus
  /** One plain sentence about what happened in this step, when known. */
  detail: string | null
}

const ORDER: AgentStep[] = AGENT_STEPS.map((s) => s.id)
/** Steps that only happen when the agent decides to write to the contact. */
const OPTIONAL: ReadonlySet<AgentStep> = new Set<AgentStep>(['timing', 'draft', 'act'])
const HISTORY_INDEX = ORDER.indexOf('history')

/* ------------------------------------------------------------------ safe reads of untyped event data */

type Data = Record<string, unknown>

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** The tool an event is about (tool_call / tool_result), if any. */
export function toolName(event: AgentEvent): string | null {
  return isRecord(event.data) ? text(event.data.name) : null
}

function toolResult(event: AgentEvent): Data | null {
  return isRecord(event.data) && isRecord(event.data.result) ? event.data.result : null
}

/** First line of a free-text event, without the "Plan:" prefix. */
function firstLine(value: string | null | undefined): string | null {
  const line = (value ?? '').trim().split(/\r?\n/)[0]?.replace(/^plan:\s*/i, '').trim()
  return line ? line : null
}

/* ------------------------------------------------------------------ plain-language descriptions */

function describeToolResult(name: string, result: Data | null): string | null {
  if (!result) return null
  const error = text(result.error)
  if (error) return `Error: ${error}`

  switch (name) {
    case 'save_conversation': {
      const added = count(result.messages_added) ?? 0
      const skipped = count(result.messages_skipped_as_duplicates) ?? 0
      if (result.new_thread) return `Saved a new conversation with ${pluralize(added, 'message')}`
      if (added) return `Added ${pluralize(added, 'new message')} to a conversation it already had`
      return `Already saved; ${pluralize(skipped, 'duplicate message')} skipped`
    }
    case 'get_contact': {
      const name = text(result.name)
      const type = text(result.type)
      if (!name) return null
      return type ? `${name}, ${contactTypeLabel(type).toLowerCase()}` : name
    }
    case 'get_thread_history': {
      const summary = isRecord(result.summary) ? result.summary : {}
      const contact = isRecord(result.contact) ? result.contact : {}
      const parts = [pluralize(items(result.messages).length, 'message')]
      parts.push(summary.recipient_wrote_last ? `${firstName(text(contact.name))} wrote last` : 'we wrote last')
      const sent = count(summary.followups_already_sent)
      if (sent) parts.push(`${pluralize(sent, 'follow-up')} already sent`)
      const pending = items(summary.pending_followups).length
      if (pending) parts.push(`${pending} already scheduled`)
      return parts.join(' · ')
    }
    case 'list_followups': {
      const n = items(result.followups).length
      return n ? `${pluralize(n, 'earlier follow-up')} to them` : 'no earlier follow-ups to them'
    }
    case 'lookup_faq': {
      const match = items(result.matches)[0]
      const topic = isRecord(match) ? text(match.topic) : null
      return topic ? `Found a documented answer: ${topic}` : 'No documented answer, so it will not guess'
    }
    case 'get_strategy': {
      const type = text(result.contact_type)
      const delay = count(result.delay_hours)
      const slot = text(result.suggested_send_at_local)
      const parts: string[] = []
      if (type) parts.push(`${contactTypeLabel(type)} strategy`)
      if (delay !== null) parts.push(`wait ${formatHours(delay)}`)
      if (slot) parts.push(`next slot ${slot}`)
      return parts.length ? parts.join(' · ') : null
    }
    case 'schedule_followup':
    case 'send_email_now': {
      const status = text(result.status)
      if (status === 'scheduled') return `Scheduled for ${text(result.send_at_local) ?? 'the chosen time'}`
      if (status === 'sent') {
        const to = text(result.delivered_to)
        const mock = result.provider === 'mock' ? ' (mock outbox)' : ''
        return to ? `Sent to ${to}${mock}` : `Sent${mock}`
      }
      if (status === 'failed') return `Could not send: ${text(result.error) ?? 'the email provider refused it'}`
      if (status === 'not_sent') return 'Outside their business hours, so it will be scheduled instead'
      if (status === 'blocked') {
        const reasons = items(result.reasons).map(text).filter(Boolean)
        return reasons.length ? `Blocked by a safeguard: ${reasons.join('; ')}` : 'Blocked by a safeguard'
      }
      return null
    }
    case 'cancel_followup': {
      const status = text(result.status)
      if (status === 'cancelled') return 'Cancelled the pending follow-up'
      return text(result.detail)
    }
    case 'close_thread':
      return result.status === 'closed' ? 'Closed the conversation and cancelled anything pending' : null
    default:
      return null
  }
}

/** One plain sentence for an event, or null when it has nothing worth showing on the timeline. */
export function describeEvent(event: AgentEvent): string | null {
  const name = toolName(event)
  switch (event.type) {
    case 'tool_call':
      return name ? `${TOOL_LABELS[name] ?? name}…` : null
    case 'tool_result':
      return name ? describeToolResult(name, toolResult(event)) : null
    case 'decision': {
      const decision = isRecord(event.data) ? text(event.data.decision) : null
      return decision ? decisionMeta(decision as Decision).label : null
    }
    case 'info':
      if (event.step === 'draft') {
        const subject = isRecord(event.data) ? text(event.data.subject) : null
        return subject ? `Subject: ${subject}` : 'Drafting the email'
      }
      return firstLine(event.text)
    case 'plan':
    case 'thinking':
    case 'error':
      return firstLine(event.text)
  }
}

function actLabel(tool: string | null): string {
  switch (tool) {
    case 'send_email_now':
      return 'Sending'
    case 'close_thread':
      return 'Closing the conversation'
    case 'cancel_followup':
      return 'Cancelling'
    default:
      return AGENT_STEPS.find((s) => s.id === 'act')?.label ?? 'Scheduling'
  }
}

/* ------------------------------------------------------------------ timeline */

/**
 * The seven steps with their status for the current point of the run.
 * @param decided the run finished with a recorded decision (false for a run that stopped early).
 */
export function deriveSteps(events: AgentEvent[], phase: RunPhase, decided: boolean): StepView[] {
  let position = -1
  const seen = new Set<AgentStep>()
  // Per step, one line per tool (a tool's result replaces its "…" call line) plus the latest note.
  const notes = new Map<AgentStep, Map<string, string>>()
  let actTool: string | null = null
  let loadedSubject: string | null = null
  let decisionReason: string | null = null

  for (const event of events) {
    const step = event.step
    if (!step || !ORDER.includes(step)) continue
    // The opening plan comes before the agent has read anything: it is not a decision yet.
    const reasoning = event.type === 'plan' || event.type === 'thinking'
    if (reasoning && position < HISTORY_INDEX) continue

    seen.add(step)
    position = Math.max(position, ORDER.indexOf(step))

    const tool = toolName(event)
    const key = tool && (event.type === 'tool_call' || event.type === 'tool_result') ? `tool:${tool}` : 'note'
    const lines = notes.get(step) ?? new Map<string, string>()
    notes.set(step, lines)
    const line = describeEvent(event)
    if (line) lines.set(key, line)
    else if (event.type === 'tool_result') lines.delete(key) // nothing to say once it finished (e.g. record_decision)

    if (step === 'act' && tool) actTool = tool
    if (event.type === 'tool_result' && tool === 'get_thread_history') loadedSubject = text(toolResult(event)?.subject)
    if (event.type === 'decision' && isRecord(event.data)) decisionReason = text(event.data.reason)
  }

  const detailOf = (id: AgentStep): string | null => {
    const lines = notes.get(id)
    if (lines?.size) return sentenceCase([...lines.values()].join(' · '))
    // Stored conversations are read by get_thread_history; say so instead of leaving the step blank.
    if (id === 'read' && loadedSubject) return `Loaded “${loadedSubject}”`
    if (id === 'decide' && decisionReason) return sentenceCase(decisionReason)
    return null
  }

  const current = Math.max(position, 0)
  const passed = (id: AgentStep): StepStatus => (seen.has(id) || !OPTIONAL.has(id) ? 'done' : 'skipped')

  return AGENT_STEPS.map(({ id, label }, index) => {
    let status: StepStatus
    if (phase === 'idle') status = 'pending'
    else if (phase === 'running') status = index === current ? 'active' : index < current ? passed(id) : 'pending'
    else if (phase === 'done' && decided) status = passed(id)
    else status = index === current ? 'failed' : index < current ? passed(id) : 'pending'
    return { id, label: id === 'act' ? actLabel(actTool) : label, status, detail: detailOf(id) }
  })
}

/* ------------------------------------------------------------------ result helpers */

export interface DecisionInfo {
  decision: Decision | null
  /** Why, as the agent recorded it. */
  reason: string | null
  /** The facts it weighed. */
  keyPoints: string[]
}

/** The decision the agent recorded (the last `decision` event), if any. */
export function decisionInfo(events: AgentEvent[]): DecisionInfo | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== 'decision' || !isRecord(event.data)) continue
    return {
      decision: (text(event.data.decision) as Decision | null) ?? null,
      reason: text(event.data.reason),
      keyPoints: items(event.data.key_points)
        .map((p) => (typeof p === 'string' ? humanizeKeyPoint(p) : null))
        .filter((p): p is string => Boolean(p)),
    }
  }
  return null
}

/** "recipient wrote last: False" -> "recipient wrote last: no". */
function humanizeKeyPoint(point: string): string | null {
  const trimmed = point.trim()
  if (!trimmed) return null
  return sentenceCase(trimmed.replace(/:\s*True$/, ': yes').replace(/:\s*False$/, ': no').replace(/:\s*None$/, ': none'))
}

export function sentenceCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

/** True as soon as the stream shows Smart AI handing over to the built-in rules. */
export function detectFallback(events: AgentEvent[], result: RunResult | null): boolean {
  if (result?.fallback_used) return true
  return events.some(
    (e) => e.type === 'info' && ((isRecord(e.data) && e.data.reason === 'auth') || /falling back|built-in rules/i.test(e.text ?? '')),
  )
}

/** Pretty JSON for the technical trace. */
export function formatData(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
