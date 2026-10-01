import { Check, ChevronRight, Clock } from 'lucide-react'
import { EmailPreview } from '@/components/run/email-preview'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ContactTypeBadge, ConversationStatusBadge, DecisionBadge } from '@/components/status-badges'
import type { AgentStep, Contact, ConversationSummary, Decision } from '@/lib/api'
import { AGENT_STEPS, RUN_MODE_LABELS, contactTypeLabel, decisionMeta, firstName, formatHours, formatTimeZone, possessive } from '@/lib/format'
import { STRATEGIES } from '@/lib/product'
import { sentenceCase } from './content'

/*
 * A static rendering of one real run: the sample conversation that ships with the demo
 * (samples/new_customer.txt), built from the same components the app uses.
 */

const CONTACT: Contact = {
  name: 'Karan Malhotra',
  email: 'karan.malhotra@urbanbrew.in',
  type: 'customer',
  company: 'Urban Brew Cafes',
  timezone: 'Asia/Kolkata',
}
const SENDER = 'Alex'
const SUBJECT = 'HR and payroll module for 3 cafe outlets'
const CLOCK_LOCAL = 'Tue 29 Sep, 16:40'
const SEND_AT_LOCAL = 'Thu 01 Oct, 10:05'
const DECISION: Decision = 'scheduled'

const strategy = STRATEGIES[CONTACT.type]
const typeLabel = contactTypeLabel(CONTACT.type)

const CONVERSATION: Pick<ConversationSummary, 'status' | 'pending_followup' | 'last_from'> = {
  status: 'open',
  last_from: 'us',
  pending_followup: { id: 1, send_at: '2026-10-01T04:35:00Z', send_at_local: SEND_AT_LOCAL },
}

const STEP_DETAILS: Record<AgentStep, { detail: string; tool?: string }> = {
  read: { detail: `${CONTACT.name}, ${typeLabel.toLowerCase()} at ${CONTACT.company} · 2 messages`, tool: 'get_contact' },
  history: { detail: 'We wrote last, 7 hours ago · no follow-ups sent or pending', tool: 'get_thread_history' },
  decide: { detail: 'The pricing answer and demo offer are unanswered, so a follow-up is due' },
  timing: { detail: `${typeLabel} strategy: ${formatHours(strategy.delay_hours)} after our last email, in business hours`, tool: 'get_strategy' },
  draft: { detail: `${sentenceCase(strategy.tone)} · ${strategy.length.replace('-', '–')}` },
  act: { detail: `Safeguards passed · queued for ${SEND_AT_LOCAL}`, tool: 'schedule_followup' },
  record: { detail: 'Decision and reasons written to the audit log', tool: 'record_decision' },
}

const WHY =
  `${firstName(CONTACT.name)} asked about pricing and biometric attendance. ${SENDER} answered and offered a demo, but there is no reply yet. ` +
  `Nothing is queued and no follow-ups have gone out, so one friendly reminder is scheduled ${formatHours(strategy.delay_hours)} after ${possessive(SENDER)} email.`

const EMAIL_BODY = `Hi Karan,

Just checking in on the HR Lite details I sent on Tuesday. If it helps, I can walk you through the roster planner and the ZKTeco and eSSL attendance setup for all three Urban Brew outlets in a 20-minute demo.

Would Friday afternoon or early next week suit you? A one-line reply is all I need.

Best regards,
${SENDER}`

/** Hero illustration: the conversation header, the seven-step run and its result. */
export function ProductPreview() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-border-strong bg-surface">
        {/* Window strip: breadcrumb + simulated clock, as in the app's top bar. */}
        <div className="flex h-10 items-center gap-2 border-b border-border px-4 text-xs text-muted">
          <span className="hidden sm:inline">Conversations</span>
          <ChevronRight aria-hidden className="hidden size-3.5 text-subtle sm:block" />
          <span className="truncate font-medium text-foreground">{CONTACT.name}</span>
          <span className="ml-auto inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-2.5 font-mono">
            <Clock aria-hidden className="size-4" />
            <span className="sr-only">Demo clock:</span>
            <span className="tabular-nums">{CLOCK_LOCAL}</span>
          </span>
        </div>

        {/* Conversation header. */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={CONTACT.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-foreground">{CONTACT.name}</p>
              <p className="truncate text-sm text-muted">{SUBJECT}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ContactTypeBadge type={CONTACT.type} />
            <ConversationStatusBadge conversation={CONVERSATION} />
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* The run, step by step. */}
          <div className="border-b border-border px-4 py-5 sm:px-5 lg:border-r lg:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">Agent run</p>
              <Badge tone="outline" size="sm">
                {RUN_MODE_LABELS.llm}
              </Badge>
            </div>
            <ol className="mt-4">
              {AGENT_STEPS.map((step, index) => {
                const { detail, tool } = STEP_DETAILS[step.id]
                const last = index === AGENT_STEPS.length - 1
                return (
                  <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {/* Same marks as the live StepTimeline (components/run/step-timeline.tsx) in its "done" state. */}
                    {last ? null : <span aria-hidden className="absolute top-5 bottom-0 left-[9.5px] w-px bg-foreground/30" />}
                    <span aria-hidden className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {step.label}
                        <span className="sr-only"> (done)</span>
                      </p>
                      <p className="text-xs text-muted">{detail}</p>
                    </div>
                    {tool ? <code className="mt-0.5 hidden shrink-0 font-mono text-xs text-subtle sm:block">{tool}</code> : null}
                  </li>
                )
              })}
            </ol>
          </div>

          {/* The result: decision, reasons, the drafted email and when it goes out. */}
          <div className="px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DecisionBadge decision={DECISION} />
              <span className="text-xs text-muted">{decisionMeta(DECISION).description}</span>
            </div>

            <p className="mt-5 text-xs font-medium text-muted">Why</p>
            <p className="mt-1 text-sm text-foreground">{WHY}</p>

            <EmailPreview
              className="mt-5"
              draft
              label="Drafted follow-up"
              to={
                <>
                  {CONTACT.name} <span className="text-muted">&lt;{CONTACT.email}&gt;</span>
                </>
              }
              subject={`Re: ${SUBJECT}`}
              body={EMAIL_BODY}
            />

            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-subtle">Sends</dt>
                <dd className="mt-0.5 font-medium text-foreground tabular-nums">{SEND_AT_LOCAL}</dd>
                <dd className="text-xs text-muted">{formatTimeZone(CONTACT.timezone)} time · in 2 days</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Strategy</dt>
                <dd className="mt-0.5 font-medium text-foreground">{typeLabel}</dd>
                <dd className="text-xs text-muted">Waits {formatHours(strategy.delay_hours)}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Follow-ups</dt>
                <dd className="mt-0.5 font-medium text-foreground tabular-nums">1 of {strategy.max_followups}</dd>
                <dd className="text-xs text-muted">for this conversation</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-subtle">
        One run on the sample conversation included with the demo. At {SEND_AT_LOCAL} the scheduler checks the thread again, then sends.
      </figcaption>
    </figure>
  )
}
