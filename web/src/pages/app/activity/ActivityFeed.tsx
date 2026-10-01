import { Bot, ChevronRight, FastForward, Layers, Send, type LucideIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RelativeTime } from '@/components/relative-time'
import { DecisionBadge } from '@/components/status-badges'
import { Badge, Skeleton } from '@/components/ui'
import type { Activity, Decision, RunMode } from '@/lib/api'
import { DECISION_META, RUN_MODE_LABELS, parseDate } from '@/lib/format'
import { useNow } from '@/lib/queries'
import { cn } from '@/lib/utils'
import {
  RUN_HEADER_ACTIONS,
  actionMeta,
  buildFeed,
  dayKey,
  dayLabel,
  detailRows,
  nodeTimestamp,
  summarize,
  timeOfDay,
  type DetailValue,
  type FeedNode,
  type RunKind,
} from './describe'

export interface ActivityFeedProps {
  /** Entries newest first, as GET /api/activity returns them. */
  items: Activity[]
  /** Show which conversation each entry belongs to (off when the feed is filtered to one). */
  showConversation?: boolean
}

interface DaySection {
  key: string
  label: string
  nodes: FeedNode[]
}

/** The audit timeline: entries grouped by day, and the steps of one run grouped together. */
export function ActivityFeed({ items, showConversation = true }: ActivityFeedProps) {
  const now = useNow()
  const sections: DaySection[] = []
  for (const node of buildFeed(items)) {
    const ts = nodeTimestamp(node)
    const key = dayKey(ts)
    const last = sections[sections.length - 1]
    if (last && last.key === key) last.nodes.push(node)
    else sections.push({ key, label: dayLabel(ts, now), nodes: [node] })
  }

  return (
    <div className="flex flex-col gap-8">
      {sections.map((section, index) => (
        <section key={`${section.key}-${index}`} aria-labelledby={`activity-day-${index}`}>
          <h2 id={`activity-day-${index}`} className="mb-4 text-sm font-medium text-muted">
            {section.label}
          </h2>
          <ol className="flex flex-col">
            {section.nodes.map((node) =>
              node.kind === 'run' ? (
                <RunNode key={node.key} node={node} showConversation={showConversation} />
              ) : (
                <EntryNode key={node.key} entry={node.entry} showConversation={showConversation} />
              ),
            )}
          </ol>
        </section>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ timeline rail */

function RailItem({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="group/item relative flex gap-3 pb-7 last:pb-0">
      <span aria-hidden className="absolute top-9 bottom-1 left-[15px] w-px bg-border group-last/item:hidden" />
      <span
        aria-hidden
        className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">{children}</div>
    </li>
  )
}

function EntryTime({ entry, relative = false }: { entry: Activity; relative?: boolean }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted tabular-nums">
      <time dateTime={parseDate(entry.ts).toISOString()} title={entry.ts_local}>
        {timeOfDay(entry.ts_local)}
      </time>
      {relative ? (
        <>
          <span aria-hidden className="hidden text-subtle sm:inline">
            ·
          </span>
          <RelativeTime value={entry.ts} title={entry.ts_local} className="hidden sm:inline" />
        </>
      ) : null}
    </span>
  )
}

function ConversationRef({ entry }: { entry: Activity }) {
  if (!entry.thread_id) return null
  const name = entry.contact_name?.trim()
  const subject = entry.subject?.trim()
  return (
    <Link
      to={`/app/conversations/${encodeURIComponent(entry.thread_id)}`}
      className="min-w-0 truncate rounded-sm text-muted underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
    >
      {name ? <span className="font-medium text-foreground/90">{name}</span> : null}
      {name && subject ? <span aria-hidden> · </span> : null}
      {subject ?? (name ? null : 'Open conversation')}
    </Link>
  )
}

/* ------------------------------------------------------------------ single entry */

function EntryNode({ entry, showConversation }: { entry: Activity; showConversation: boolean }) {
  const meta = actionMeta(entry.action)
  const summary = summarize(entry)
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const hasDetails = detailRows(entry).length > 0
  const conversation = showConversation ? <ConversationRef entry={entry} /> : null

  return (
    <RailItem icon={meta.icon}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-base font-medium text-foreground">{entry.label}</p>
        {meta.badge ? (
          <Badge tone={meta.badge.tone} size="sm" dot>
            {meta.badge.label}
          </Badge>
        ) : null}
        <EntryTime entry={entry} relative />
      </div>
      {summary ? <p className="mt-0.5 text-sm break-words text-muted">{summary}</p> : null}
      {conversation || hasDetails ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {conversation}
          {hasDetails ? <DetailsToggle open={open} onToggle={() => setOpen((v) => !v)} controls={panelId} /> : null}
        </div>
      ) : null}
      {open ? <DetailsPanel id={panelId} entry={entry} /> : null}
    </RailItem>
  )
}

/* ------------------------------------------------------------------ run (several steps of one agent or scheduler run) */

const RUN_ICONS: Record<RunKind, LucideIcon> = { agent: Bot, scheduler: Send, batch: Layers }

function modeOf(entry: Activity | undefined): RunMode | null {
  const mode = entry?.details?.mode
  return mode === 'llm' || mode === 'rules' ? mode : null
}

function decisionOf(entries: Activity[]): Decision | null {
  const finished = entries.find((e) => e.action === 'agent_run_finished')
  const fromFinished = finished?.details?.decision
  if (typeof fromFinished === 'string' && fromFinished in DECISION_META) return fromFinished as Decision
  const recorded = [...entries].reverse().find((e) => e.action.startsWith('decision:'))
  const fromLog = recorded?.action.slice('decision:'.length)
  return fromLog && fromLog in DECISION_META ? (fromLog as Decision) : null
}

function RunNode({ node, showConversation }: { node: Extract<FeedNode, { kind: 'run' }>; showConversation: boolean }) {
  const { entries, runKind, runId } = node
  const started = entries.find((e) => e.action === 'agent_run_started')
  const finished = entries.find((e) => e.action === 'agent_run_finished')
  const clock = entries.find((e) => e.action === 'clock_advanced')
  const batch = entries.find((e) => e.action === 'batch_finished') ?? entries.find((e) => e.action === 'batch_started')
  const steps = entries.filter((e) => !RUN_HEADER_ACTIONS.has(e.action))
  const first = entries[0]
  const withThread = entries.find((e) => e.thread_id)

  let title: string
  let summary: string | null
  let icon = RUN_ICONS[runKind]
  if (runKind === 'agent') {
    title = 'Assistant reviewed the conversation'
    summary = finished ? summarize(finished) : started ? summarize(started) : null
  } else if (clock) {
    title = clock.label
    summary = summarize(clock)
    icon = FastForward
  } else if (runKind === 'batch') {
    title = 'Batch run'
    summary = batch ? summarize(batch) : null
  } else {
    title = 'Due follow-ups processed'
    summary = null
  }

  const requested = modeOf(started)
  const used = modeOf(finished)
  const decision = runKind === 'agent' ? decisionOf(entries) : null
  const inProgress = runKind === 'agent' && Boolean(started) && !finished
  const model = used === 'llm' && typeof started?.details?.model === 'string' ? started.details.model : null

  return (
    <RailItem icon={icon}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        {requested === 'llm' && used === 'rules' ? (
          <Badge tone="outline" size="sm" title="Smart AI was requested but unavailable, so the built-in rules handled this run.">
            Rules fallback
            <span className="sr-only">: Smart AI was unavailable, so the built-in rules handled this run</span>
          </Badge>
        ) : used || requested ? (
          <Badge tone="outline" size="sm">
            {RUN_MODE_LABELS[(used ?? requested) as RunMode]}
          </Badge>
        ) : null}
        {decision ? <DecisionBadge decision={decision} size="sm" /> : null}
        {inProgress ? (
          <Badge tone="neutral" size="sm">
            No result recorded
          </Badge>
        ) : null}
        <EntryTime entry={first} relative />
      </div>
      {summary ? <p className="mt-0.5 text-sm break-words text-muted">{summary}</p> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {showConversation && withThread ? <ConversationRef entry={withThread} /> : null}
        <span className="text-subtle">
          Run <span className="font-mono">{runId}</span>
          {model ? (
            <>
              {' '}
              · <span className="font-mono">{model}</span>
            </>
          ) : null}
        </span>
      </div>
      {steps.length ? (
        <ol aria-label="Steps in this run" className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
          {steps.map((entry) => (
            <StepRow key={entry.id} entry={entry} hideBadge={Boolean(decision) && entry.action.startsWith('decision:')} />
          ))}
        </ol>
      ) : null}
    </RailItem>
  )
}

function StepRow({ entry, hideBadge }: { entry: Activity; hideBadge: boolean }) {
  const meta = actionMeta(entry.action)
  const Icon = meta.icon
  const summary = summarize(entry)
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const hasDetails = detailRows(entry).length > 0

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <Icon aria-hidden className="mt-[3px] size-4 shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-foreground">{entry.label}</p>
          {meta.badge && !hideBadge ? (
            <Badge tone={meta.badge.tone} size="sm" dot>
              {meta.badge.label}
            </Badge>
          ) : null}
          <EntryTime entry={entry} />
        </div>
        {summary ? <p className="mt-0.5 text-sm break-words text-muted">{summary}</p> : null}
        {hasDetails ? (
          <div className="mt-1 text-xs">
            <DetailsToggle open={open} onToggle={() => setOpen((v) => !v)} controls={panelId} />
          </div>
        ) : null}
        {open ? <DetailsPanel id={panelId} entry={entry} /> : null}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ details */

function DetailsToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded-sm font-medium text-muted transition-colors duration-150 hover:text-foreground"
    >
      <ChevronRight aria-hidden className={cn('size-3.5 transition-transform duration-150', open && 'rotate-90')} />
      {open ? 'Hide details' : 'Details'}
    </button>
  )
}

function DetailsPanel({ id, entry }: { id: string; entry: Activity }) {
  const rows = detailRows(entry)
  return (
    <div id={id} className="mt-2 animate-fade-in rounded-md border border-border bg-background px-3 py-3">
      <dl className="flex flex-col gap-2.5 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="grid gap-0.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
            <dt className="text-muted">{row.label}</dt>
            <dd className="min-w-0 break-words text-foreground">
              <DetailValueView value={row.value} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-border pt-2 text-xs text-subtle">
        Logged as <code className="font-mono text-muted">{entry.action}</code>
        {entry.run_id ? (
          <>
            {' '}
            in run <code className="font-mono text-muted">{entry.run_id}</code>
          </>
        ) : null}
        <span aria-hidden> · </span>
        <span>entry #{entry.id}</span>
      </p>
    </div>
  )
}

function DetailValueView({ value }: { value: DetailValue }) {
  switch (value.kind) {
    case 'list':
      return (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 marker:text-subtle">
          {value.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )
    case 'code':
      return <pre className="scrollbar-thin overflow-x-auto rounded-sm bg-surface-2 px-2 py-1.5 font-mono text-xs text-muted">{value.text}</pre>
    case 'text':
      return <span className={cn(value.mono && 'font-mono', value.block && 'block whitespace-pre-wrap')}>{value.text}</span>
  }
}

/* ------------------------------------------------------------------ loading */

/** Placeholder rows while the activity log loads. */
export function ActivityFeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <Skeleton className="h-4 w-16" />
      <ol className="flex flex-col">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex gap-3 pb-7 last:pb-0">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2 pt-1.5">
              <div className="flex items-center gap-3">
                <Skeleton className={cn('h-3.5', i % 3 === 0 ? 'w-56' : i % 3 === 1 ? 'w-40' : 'w-48')} />
                <Skeleton className="ml-auto h-3 w-10" />
              </div>
              <Skeleton className={cn('h-3', i % 2 === 0 ? 'w-3/4' : 'w-1/2')} />
              {i % 3 === 0 ? <Skeleton className="mt-1 h-16 w-full" /> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
