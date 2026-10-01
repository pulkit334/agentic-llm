/**
 * Typed client for the Followup API (FastAPI, api/main.py on the backend branch).
 *
 * Every call goes to `/api/...` on the same origin (Vite proxies it to 127.0.0.1:8010 in dev;
 * in production FastAPI serves this app). The session lives in the HttpOnly `fu_session`
 * cookie, so requests only need `credentials: 'include'`.
 *
 * Errors: every non-2xx response throws an `ApiError` whose `message` is the server's
 * human-readable `detail`. 401 means "not signed in" (see `isUnauthorized`).
 */

/* ------------------------------------------------------------------ types */

export type Role = 'admin' | 'member'

export interface User {
  id: number
  email: string
  name: string
  role: Role
}

export interface Clock {
  /** ISO 8601 UTC, e.g. "2026-10-01T05:30:00Z" */
  utc: string
  /** e.g. "Thu 01 Oct, 11:00" in `tz` */
  local: string
  /** IANA zone of the local string, e.g. "Asia/Kolkata" */
  tz: string
}

export type ContactType = 'customer' | 'student' | 'employee' | 'business'

export interface Contact {
  email: string
  name: string
  type: ContactType
  company: string | null
  timezone: string
}

export type ConversationStatus = 'open' | 'closed'

export interface PendingFollowUpRef {
  id: number
  send_at: string
  send_at_local: string
}

export interface ConversationSummary {
  id: string
  subject: string
  status: ConversationStatus
  contact: Contact
  message_count: number
  last_message_at: string
  /** Who wrote the last message; null only when the thread has no messages. */
  last_from: 'us' | 'them' | null
  /** Hours since the last message while the thread is open; null when closed. */
  waiting_hours: number | null
  pending_followup: PendingFollowUpRef | null
}

export interface Message {
  id: number
  direction: 'inbound' | 'outbound'
  body: string
  sent_at: string
  sent_at_local: string
  /** True for our follow-up emails (they count toward the strategy's max_followups). */
  is_followup: boolean
}

export interface Strategy {
  delay_hours: number
  max_followups: number
  tone: string
  focus: string
  length: string
  deadline_lead_hours?: number
}

export type FollowUpStatus = 'pending' | 'sent' | 'cancelled'

export interface FollowUp {
  id: number
  thread_id: string
  contact: Contact
  subject: string
  body: string
  send_at: string
  send_at_local: string
  status: FollowUpStatus
  strategy: string | null
  /** Why it was scheduled. */
  reason: string | null
  /** Why it was cancelled (cancelled follow-ups only). */
  cancel_reason: string | null
  created_at: string
  /** When it was actually sent or cancelled; null while pending. Can be later than send_at ("Send due now"). */
  done_at: string | null
  /** done_at in the contact's time zone, e.g. "Fri 02 Oct, 10:05". */
  done_at_local: string | null
}

export interface Activity {
  id: number
  ts: string
  ts_local: string
  thread_id: string | null
  /** Machine code, e.g. "followup_scheduled", "decision:skipped". */
  action: string
  /** Plain-language label from the server. */
  label: string
  details: Record<string, unknown> | null
  /** Groups the steps of one agent or scheduler run. */
  run_id: string | null
  /** Thread subject, when the action belongs to a thread. */
  subject: string | null
  contact_name: string | null
}

export interface ConversationDetail extends ConversationSummary {
  messages: Message[]
  followups: FollowUp[]
  activity: Activity[]
  strategy: Strategy
}

export interface OverviewCounts {
  conversations: number
  open: number
  scheduled: number
  sent: number
  skipped: number
}

export interface Overview {
  clock: Clock
  counts: OverviewCounts
  llm_available: boolean
  email_mode: 'mock' | 'smtp'
  recent: Activity[]
}

export interface SentEmail {
  id: number
  thread_id: string | null
  to_email: string
  delivered_to: string
  subject: string
  body: string
  provider: 'mock' | 'smtp' | string
  status: 'sent' | 'failed' | string
  error: string | null
  sent_at: string
  /** sent_at in `timezone`. */
  sent_at_local: string
  /** IANA zone of sent_at_local: the recipient's, or the demo clock's when the address has no contact. */
  timezone: string
  contact_name: string | null
}

export interface StrategiesResponse {
  types: Record<ContactType, Strategy>
  min_gap_hours: number
  /** The gap a student/employee deadline reminder may shrink to when min_gap_hours would miss the deadline. */
  deadline_min_gap_hours: number
  /** e.g. "Mon-Fri 09:00-18:00 local" */
  business_hours: string
}

/** One follow-up handled by the scheduler (advance / run-due). */
export interface DueResult {
  followup_id: number
  thread_id: string
  to: string
  subject: string
  send_at: string
  status: 'sent' | 'cancelled' | 'failed'
  reason?: string | null
  outbox_id?: number | null
  provider?: string | null
  delivered_to?: string | null
}

export type RunMode = 'llm' | 'rules'

export type AgentEventType = 'plan' | 'thinking' | 'tool_call' | 'tool_result' | 'decision' | 'info' | 'error'

export type AgentStep = 'read' | 'history' | 'decide' | 'timing' | 'draft' | 'act' | 'record'

export interface AgentEvent {
  type: AgentEventType
  text: string
  /** tool_call: {name, input}; tool_result: {name, result, is_error}; draft info: {subject, body}. */
  data: Record<string, unknown> | null
  step: AgentStep | null
}

export type Decision = 'scheduled' | 'sent_now' | 'replied' | 'skipped' | 'blocked_duplicate' | 'closed'

export interface RunResult {
  run_id: string | null
  mode: RunMode
  thread_id: string | null
  decision: Decision | null
  summary: string
  followup: FollowUp | null
  email: { subject: string; body: string; to: string } | null
  /** True when Smart AI was requested but the run fell back to the built-in rules. */
  fallback_used: boolean
}

export type RunAgentBody = { mode: RunMode } & ({ thread_id: string; text?: never } | { text: string; thread_id?: never })

/* ------------------------------------------------------------------ transport */

const API_BASE = `${(import.meta.env.VITE_API_BASE as string | undefined) ?? ''}/api`

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/** True for a 401 from the API (session missing or expired). */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/** A message that is safe to show to people for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.detail || fallback
  if (error instanceof DOMException && error.name === 'AbortError') return 'The request was cancelled.'
  if (error instanceof TypeError) return 'Could not reach the server. Check that the API is running.'
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function detailOf(payload: unknown, status: number, statusText: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    // FastAPI validation errors: [{loc, msg, type}, ...]
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => (item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : null))
        .filter(Boolean)
      if (messages.length) return messages.join('. ')
    }
  }
  if (status >= 500) return 'The server ran into a problem. Please try again.'
  return statusText || `Request failed (${status})`
}

async function readError(res: Response): Promise<ApiError> {
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    // not JSON
  }
  return new ApiError(res.status, detailOf(payload, res.status, res.statusText))
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

async function request<T>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await readError(res)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

/* ------------------------------------------------------------------ auth */

export function getAuthStatus(signal?: AbortSignal) {
  return request<{ has_users: boolean }>('GET', '/auth/status', undefined, signal)
}

export function register(body: { name: string; email: string; password: string }) {
  return request<{ user: User }>('POST', '/auth/register', body)
}

export function login(body: { email: string; password: string }) {
  return request<{ user: User }>('POST', '/auth/login', body)
}

export function logout() {
  return request<void>('POST', '/auth/logout')
}

export function getMe(signal?: AbortSignal) {
  return request<{ user: User }>('GET', '/auth/me', undefined, signal)
}

/* ------------------------------------------------------------------ overview + conversations */

export function getOverview(signal?: AbortSignal) {
  return request<Overview>('GET', '/overview', undefined, signal)
}

export function listConversations(signal?: AbortSignal) {
  return request<ConversationSummary[]>('GET', '/conversations', undefined, signal)
}

export function getConversation(id: string, signal?: AbortSignal) {
  return request<ConversationDetail>('GET', `/conversations/${encodeURIComponent(id)}`, undefined, signal)
}

/** Demo control: the contact replies now (on the simulated clock). */
export function simulateReply(id: string, body: string) {
  return request<{ ok: true }>('POST', `/conversations/${encodeURIComponent(id)}/simulate-reply`, { body })
}

/* ------------------------------------------------------------------ follow-ups, sent, activity, strategies */

export function listFollowups(status?: FollowUpStatus, signal?: AbortSignal) {
  return request<FollowUp[]>('GET', `/followups${qs({ status })}`, undefined, signal)
}

/** Edit a pending follow-up's subject, body and/or send time (ISO; moved into business hours if needed). */
export function updateFollowup(id: number, patch: { subject?: string; body?: string; send_at?: string }) {
  return request<FollowUp>('PATCH', `/followups/${id}`, patch)
}

/** Send a pending follow-up immediately (safety rules still apply). */
export function sendFollowupNow(id: number) {
  return request<FollowUp>('POST', `/followups/${id}/send-now`, {})
}

export function cancelFollowup(id: number, reason?: string) {
  return request<FollowUp>('POST', `/followups/${id}/cancel`, reason ? { reason } : {})
}

export function listSent(signal?: AbortSignal) {
  return request<SentEmail[]>('GET', '/sent', undefined, signal)
}

export interface ActivityParams {
  thread_id?: string
  limit?: number
}

export function listActivity(params: ActivityParams = {}, signal?: AbortSignal) {
  return request<Activity[]>('GET', `/activity${qs({ thread_id: params.thread_id, limit: params.limit })}`, undefined, signal)
}

export function getStrategies(signal?: AbortSignal) {
  return request<StrategiesResponse>('GET', '/strategies', undefined, signal)
}

/* ------------------------------------------------------------------ demo controls */

export function getClock(signal?: AbortSignal) {
  return request<Clock>('GET', '/demo/clock', undefined, signal)
}

/** Fast-forward the simulated clock; follow-ups that fall due are sent (or auto-cancelled) on the way. */
export function advanceClock(hours: number) {
  return request<{ clock: Clock; results: DueResult[] }>('POST', '/demo/advance', { hours })
}

/** Send every pending follow-up whose time has come, without moving the clock. */
export function runDue() {
  return request<{ results: DueResult[] }>('POST', '/demo/run-due')
}

/** Admin only: restore the seeded demo data and clock. Accounts are kept. */
export function resetDemo() {
  return request<{ ok: true }>('POST', '/demo/reset')
}

export function getSampleConversation(signal?: AbortSignal) {
  return request<{ text: string }>('GET', '/samples/new-conversation', undefined, signal)
}

/* ------------------------------------------------------------------ agent run (SSE over POST) */

/**
 * Run the agent and stream its steps.
 *
 * POST /api/agent/run answers with `text/event-stream`: one `step` event per AgentEvent, then
 * exactly one `result` event. EventSource cannot POST, so this reads the body with fetch.
 *
 * Calls `onStep` for every step and `onResult` once, and resolves with the RunResult.
 * Rejects with ApiError for HTTP errors (e.g. 409 when the conversation is already being
 * processed) or when the stream ends without a result; with an AbortError when `signal` aborts.
 */
export async function runAgent(
  body: RunAgentBody,
  onStep: (event: AgentEvent) => void,
  onResult?: (result: RunResult) => void,
  signal?: AbortSignal,
): Promise<RunResult> {
  const res = await fetch(`${API_BASE}/agent/run`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await readError(res)
  if (!res.body) throw new ApiError(500, 'The server did not stream a response.')

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  // Held in an object so TypeScript does not narrow it to `null` across the dispatch closure.
  const state: { result: RunResult | null } = { result: null }

  const dispatch = (block: string) => {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue // comments are heartbeats
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (!data.length) return
    const payload = JSON.parse(data.join('\n')) as unknown
    if (event === 'step') {
      onStep(payload as AgentEvent)
    } else if (event === 'result') {
      state.result = payload as RunResult
      onResult?.(state.result)
    } else if (event === 'error') {
      const detail = payload && typeof payload === 'object' && 'detail' in payload ? String((payload as { detail: unknown }).detail) : 'The agent run failed.'
      throw new ApiError(500, detail)
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
        dispatch(block)
        if (state.result) return state.result
        boundary = buffer.search(/\r?\n\r?\n/)
      }
    }
    if (buffer.trim()) dispatch(buffer)
  } finally {
    reader.cancel().catch(() => {})
  }

  if (!state.result) throw new ApiError(502, 'The agent stopped before reporting a result. Check the activity log for what it did.')
  return state.result
}
