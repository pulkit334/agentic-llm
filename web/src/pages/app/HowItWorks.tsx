import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { NewFollowUpLink } from '@/components/new-followup-link'
import { SectionLink } from '@/components/section-link'
import { ContactTypeBadge } from '@/components/status-badges'
import {
  Alert,
  Badge,
  Code,
  InlineError,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from '@/components/ui'
import type { AgentStep, ContactType, StrategiesResponse } from '@/lib/api'
import { AGENT_STEPS, AGENT_STEP_LABELS, CONTACT_TYPES, EMAIL_MODE_LABELS, TOOL_LABELS, formatHours, pluralize } from '@/lib/format'
import { AGENT_TOOLS, BUSINESS_HOURS, DEADLINE_MIN_GAP_HOURS, MIN_GAP_HOURS, OPT_OUT_PHRASES, SAFEGUARDS } from '@/lib/product'
import { useOverview, useStrategies } from '@/lib/queries'
import { SequenceDiagram } from './how-it-works/SequenceDiagram'

/* ------------------------------------------------------------------ content */

/** What happens in each of the seven steps of the live timeline, and the tools used there. */
const STEP_DETAILS: Record<AgentStep, { body: string; tools: string[] }> = {
  read: {
    body: 'A pasted conversation is split into a contact, a subject and messages, then saved; messages it has already seen are skipped. The contact’s type and time zone are looked up.',
    tools: ['save_conversation', 'get_contact'],
  },
  history: {
    body: 'It reads the whole thread: who wrote last and how long ago, follow-ups already sent, anything still pending, and follow-ups to the same person in other conversations.',
    tools: ['get_thread_history', 'list_followups'],
  },
  decide: {
    body: 'Follow up, answer a question, close the conversation, or do nothing. Questions are answered from the product FAQ, never guessed.',
    tools: ['lookup_faq'],
  },
  timing: {
    body: 'The recipient type sets the delay. A deadline pulls the time earlier; the gap since our last email and the recipient’s business hours push it later.',
    tools: ['get_strategy'],
  },
  draft: {
    body: 'The email is written in the tone, length and focus of the recipient’s strategy and refers to what was actually said in the thread.',
    tools: [],
  },
  act: {
    body: 'The safeguards check the draft and the time first. They can move the time or block the email; only then is it queued, sent, or the conversation closed.',
    tools: ['schedule_followup', 'send_email_now', 'cancel_followup', 'close_thread'],
  },
  record: {
    body: 'The decision and its reasons go to the audit log with the run id, next to every action taken on the way.',
    tools: ['record_decision'],
  },
}

/** Which timeline step each tool's events appear under (same mapping as the API's `step`). */
const TOOL_STEP: Record<string, AgentStep> = Object.fromEntries(
  (Object.entries(STEP_DETAILS) as [AgentStep, { tools: string[] }][]).flatMap(([step, d]) => d.tools.map((tool) => [tool, step])),
)

const SECTIONS = [
  { id: 'steps', label: 'The seven steps' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'tools', label: 'Tools' },
  { id: 'safeguards', label: 'Safeguards' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'modes', label: 'Smart AI and Rules' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/* ------------------------------------------------------------------ page */

/** /app/how-it-works: a walkthrough of how the assistant plans and carries out a follow-up. */
export default function HowItWorks() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="How it works"
          description="How the assistant plans and carries out a follow-up, and the rules it cannot break. Claude decides; code enforces."
          actions={<NewFollowUpLink />}
        />
        <nav aria-label="On this page">
          <ul className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <SectionLink
                  section={s.id}
                  className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-sm text-muted transition-colors duration-150 hover:border-border-strong hover:text-foreground"
                >
                  {s.label}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <StepsSection />
      <SequenceSection />
      <ToolsSection />
      <SafeguardsSection />
      <StrategiesSection />
      <ModesSection />
    </div>
  )
}

function Section({ id, title, description, children }: { id: SectionId; title: string; description?: ReactNode; children: ReactNode }) {
  const headingId = `${id}-heading`
  return (
    <section id={id} tabIndex={-1} aria-labelledby={headingId} className="scroll-mt-20 border-t border-border pt-10 outline-none">
      <div className="mb-6 flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? <p className="max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function ToolName({ name }: { name: string }) {
  return <Code>{name}</Code>
}

/* ------------------------------------------------------------------ 1. steps */

function StepsSection() {
  return (
    <Section
      id="steps"
      title="Plan, then act: the seven steps"
      description="Every run follows the same plan, whether Claude or the built-in rules are doing the work. These are the steps you watch light up when you let the assistant decide."
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ol className="flex flex-col">
          {AGENT_STEPS.map((step, i) => {
            const detail = STEP_DETAILS[step.id]
            return (
              <li key={step.id} className="group/step relative flex gap-4 pb-7 last:pb-0">
                <span aria-hidden className="absolute top-9 bottom-1 left-[15px] w-px bg-border group-last/step:hidden" />
                <span
                  aria-hidden
                  className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-background font-mono text-xs text-foreground tabular-nums"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <h3 className="text-base font-medium text-foreground">{step.label}</h3>
                  <p className="mt-1 max-w-2xl text-sm text-muted">{detail.body}</p>
                  {detail.tools.length ? (
                    <ul aria-label="Tools used in this step" className="mt-2 flex flex-wrap gap-1.5">
                      {detail.tools.map((tool) => (
                        <li key={tool}>
                          <ToolName name={tool} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-subtle">No tool call: the draft is part of the next step’s request.</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        <aside className="h-fit rounded-lg border border-border bg-surface p-5 lg:sticky lg:top-20">
          <h3 className="text-base font-medium text-foreground">Watch a run</h3>
          <p className="mt-1 text-sm text-muted">
            Open a conversation and choose <span className="text-foreground">Let the assistant decide</span>. The steps update live as the agent
            works. Switch on <span className="text-foreground">Technical trace</span> to see each tool call and what it returned.
          </p>
          <p className="mt-3 text-sm text-muted">Afterwards, the Activity page shows the same run as an audit trail.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Link to="/app/conversations" className={buttonVariants({ variant: 'secondary', className: 'w-full' })}>
              Open a conversation
            </Link>
            <Link to="/app/activity" className={buttonVariants({ variant: 'ghost', className: 'w-full' })}>
              See the audit trail
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ 2. sequence */

const RECORDS: { table: string; what: string }[] = [
  { table: 'followups', what: 'The queue. Each follow-up is pending, then sent or cancelled, with the reason it was scheduled.' },
  { table: 'outbox', what: 'Every send attempt, with the intended recipient and the address it was actually delivered to.' },
  { table: 'action_log', what: 'The audit trail: every tool action, block, send and decision, tagged with its run id.' },
]

function SequenceSection() {
  return (
    <Section
      id="sequence"
      title="Who talks to whom"
      description="Claude never touches the database or the mailbox directly. It asks for tools; the agent runs them; write tools ask the safeguards first. The scheduler checks again before anything is sent."
    >
      <SequenceDiagram />
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        {RECORDS.map((r) => (
          <div key={r.table} className="border-t border-border pt-3">
            <dt>
              <ToolName name={r.table} />
            </dt>
            <dd className="mt-2 text-sm text-muted">{r.what}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

/* ------------------------------------------------------------------ 3. tools */

function ToolsSection() {
  return (
    <Section
      id="tools"
      title="The agent’s tools"
      description="Eleven tools, each with a strict input schema. Reading tools have no side effects; every writing tool logs what it did."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>What it does</TableHead>
            <TableHead>Step</TableHead>
            <TableHead>Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {AGENT_TOOLS.map((tool) => {
            const step = TOOL_STEP[tool.name]
            return (
              <TableRow key={tool.name}>
                <TableCell className="align-top">
                  <div className="font-mono text-sm text-foreground">{tool.name}</div>
                  {TOOL_LABELS[tool.name] ? <div className="mt-0.5 text-xs text-muted">{TOOL_LABELS[tool.name]}</div> : null}
                </TableCell>
                <TableCell className="min-w-64 align-top text-muted">{tool.purpose}</TableCell>
                <TableCell className="align-top whitespace-nowrap text-muted">{step ? AGENT_STEP_LABELS[step] : '—'}</TableCell>
                <TableCell className="align-top">
                  <Badge tone={tool.writes ? 'neutral' : 'outline'} size="sm">
                    {tool.writes ? 'Writes' : 'Reads'}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Section>
  )
}

/* ------------------------------------------------------------------ 4. safeguards */

function SafeguardsSection() {
  return (
    <Section
      id="safeguards"
      title="Safeguards"
      description="Hard rules that run inside the tools, not instructions to the model. Even a wrong decision cannot send a duplicate, chase someone who replied, or email someone who opted out."
    >
      <ol className="grid gap-x-8 sm:grid-cols-2">
        {SAFEGUARDS.map((rule, i) => (
          <li key={rule.id} className="flex gap-4 border-t border-border py-4">
            <span aria-hidden className="pt-0.5 font-mono text-xs text-subtle tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-medium text-foreground">{rule.title}</h3>
              <p className="mt-1 text-sm text-muted">{rule.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-medium text-foreground">Phrases treated as an opt-out</h3>
        <p className="mt-1 text-sm text-muted">If their latest message contains any of these, the conversation is closed and nothing more is sent.</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {OPT_OUT_PHRASES.map((phrase) => (
            <li key={phrase}>
              <ToolName name={phrase} />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ 5. strategies */

const TIMING_STEPS: { title: string; body: string }[] = [
  { title: 'Start from our last email', body: 'Or from now, if we have not written yet.' },
  { title: 'Add the type’s delay', body: 'Each kind of recipient has its own wait, shown in the table below.' },
  { title: 'Respect deadlines and the gap', body: `Pulled earlier for a deadline, never within ${MIN_GAP_HOURS} hours of our last email.` },
  { title: 'Move into business hours', body: BUSINESS_HOURS },
]

function StrategiesSection() {
  const strategies = useStrategies()
  return (
    <Section
      id="strategies"
      title="A strategy for each kind of recipient"
      description="Customers, students, employees and business contacts are followed up differently: how long to wait, how often to try, and how the email should sound."
    >
      <ol className="mb-6 grid gap-3 md:grid-cols-4">
        {TIMING_STEPS.map((step, i) => (
          <li key={step.title} className="rounded-lg border border-border bg-surface p-4">
            <span className="font-mono text-xs text-subtle tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="mt-1 text-sm font-medium text-foreground">{step.title}</h3>
            <p className="mt-1 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>

      {strategies.isPending ? (
        <StrategiesSkeleton />
      ) : strategies.isError ? (
        <InlineError title="Could not load the strategies" error={strategies.error} onRetry={() => void strategies.refetch()} />
      ) : (
        <StrategiesTable data={strategies.data} />
      )}
    </Section>
  )
}

function StrategiesTable({ data }: { data: StrategiesResponse }) {
  const types = CONTACT_TYPES.filter((t) => data.types[t])
  const deadlineGap = data.deadline_min_gap_hours ?? DEADLINE_MIN_GAP_HOURS
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recipient</TableHead>
            <TableHead>First follow-up</TableHead>
            <TableHead>At most</TableHead>
            <TableHead>Tone</TableHead>
            <TableHead>Focus</TableHead>
            <TableHead>Length</TableHead>
            <TableHead>Deadline reminder</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((type: ContactType) => {
            const s = data.types[type]
            return (
              <TableRow key={type}>
                <TableCell className="align-top">
                  <ContactTypeBadge type={type} size="sm" />
                </TableCell>
                <TableCell className="align-top whitespace-nowrap text-foreground">after {formatHours(s.delay_hours)}</TableCell>
                <TableCell className="align-top whitespace-nowrap text-foreground">{pluralize(s.max_followups, 'follow-up')}</TableCell>
                <TableCell className="min-w-40 align-top text-muted">{s.tone}</TableCell>
                <TableCell className="min-w-64 align-top text-muted">{s.focus}</TableCell>
                <TableCell className="align-top whitespace-nowrap text-muted">{s.length}</TableCell>
                <TableCell className="align-top whitespace-nowrap text-muted">
                  {s.deadline_lead_hours ? `${formatHours(s.deadline_lead_hours)} before` : <span className="text-subtle">Not used</span>}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <p className="max-w-3xl text-xs text-muted">
        At least {data.min_gap_hours} hours between two of our emails in a conversation; a student or employee deadline reminder may use {deadlineGap}{' '}
        hours when that is the only way to arrive before the deadline. Sending window: {data.business_hours}, in the recipient’s time zone.
      </p>
    </div>
  )
}

function StrategiesSkeleton() {
  return (
    <div aria-hidden className="rounded-lg border border-border bg-surface">
      <div className="flex gap-6 border-b border-border px-4 py-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-border px-4 py-3.5 last:border-0">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ 6. modes */

function ModesSection() {
  const overview = useOverview()
  const llmAvailable = overview.data?.llm_available
  const emailMode = overview.data?.email_mode

  return (
    <Section
      id="modes"
      title="Smart AI and Rules"
      description="Two ways to run the same plan with the same tools and safeguards. You choose per run; the assistant always finishes the job."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ModePanel
          title="Smart AI"
          status={
            overview.isPending ? (
              <Skeleton className="h-5 w-20" />
            ) : llmAvailable === undefined ? null : llmAvailable ? (
              <Badge tone="success" size="sm" dot>
                Available
              </Badge>
            ) : (
              <Badge tone="warning" size="sm" dot>
                Offline
              </Badge>
            )
          }
          points={[
            'Claude runs the plan as a tool-use loop of up to 15 turns, choosing each tool from what the last one returned.',
            'Its reasoning is summarised and streamed to the screen while it works.',
            'Writes every email for the conversation it just read.',
          ]}
        />
        <ModePanel
          title="Rules"
          status={
            <Badge tone="outline" size="sm">
              Always available
            </Badge>
          }
          points={[
            'Fixed logic with no API calls: fast, offline and predictable.',
            'Detects the recipient type from keywords and drafts from templates.',
            'Answers questions from the same product FAQ.',
          ]}
        />
      </div>

      <Alert tone="neutral" title="Automatic fallback" className="mt-4">
        If Smart AI is unavailable (no API key, an invalid key, or an API error), the run carries on with the built-in rules under the same run id. The
        result says so, and nothing is done twice.
      </Alert>

      {emailMode ? (
        <p className="mt-4 text-sm text-muted">
          Email right now: <span className="font-medium text-foreground">{EMAIL_MODE_LABELS[emailMode]}</span>.{' '}
          {emailMode === 'mock'
            ? 'Emails are recorded in the outbox and shown under Sent, but not delivered.'
            : 'Emails are delivered over SMTP; a redirect address can catch every email during a demo.'}
        </p>
      ) : null}
    </Section>
  )
}

function ModePanel({ title, status, points }: { title: string; status: ReactNode; points: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        {status}
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-subtle" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  )
}
