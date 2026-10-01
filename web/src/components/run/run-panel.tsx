import { Info } from 'lucide-react'
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import { Alert, InlineError } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { AGENT_STEPS, decisionMeta, pluralize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RunResultView } from './run-result'
import { RunTrace } from './run-trace'
import { StepTimeline } from './step-timeline'
import { deriveSteps, detectFallback, type StepView } from './steps'
import type { AgentRun } from './use-agent-run'

const TRACE_KEY = 'fu-run-trace'

function readTracePreference(): boolean {
  try {
    return localStorage.getItem(TRACE_KEY) === '1'
  } catch {
    return false
  }
}

/** The technical-trace switch, remembered per browser. */
function useTracePreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readTracePreference)
  const update = useCallback((next: boolean) => {
    setOn(next)
    try {
      localStorage.setItem(TRACE_KEY, next ? '1' : '0')
    } catch {
      // not remembered; still toggles for this page
    }
  }, [])
  return [on, update]
}

function FallbackNotice() {
  return (
    <Alert
      icon={
        <span className="mt-0.5 shrink-0">
          <Info aria-hidden className="size-4 text-warning" />
        </span>
      }
      title="Smart AI was unavailable, so the built-in rules handled this run"
    >
      Same tools, same safeguards, and every step is still recorded in the activity log.
    </Alert>
  )
}

function Working({ step, mode }: { step: StepView | undefined; mode: AgentRun['mode'] }) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Spinner size={14} />
        {step ? step.label : 'Starting'}…
      </p>
      <p className="mt-1 line-clamp-2 text-sm break-words text-muted">
        {step?.detail ?? (mode === 'llm' ? 'Smart AI is getting started.' : 'The built-in rules are getting started.')}
      </p>
      <div aria-hidden className="mt-4 space-y-3">
        <Skeleton className="h-3 w-28" />
        <SkeletonText lines={3} />
      </div>
    </div>
  )
}

export interface RunPanelProps {
  run: AgentRun
  /** Offered after a failed run. */
  onRetry?: () => void
  /** Add an "Open conversation" link to the result (New follow-up page). */
  linkToConversation?: boolean
  /** Shown next to the timeline before the first run. */
  idleContent?: ReactNode
  className?: string
}

/**
 * A live agent run: the seven-step timeline, what it is doing right now, the result card when it
 * finishes (or the error if it stops), a notice when Smart AI fell back to the rules, and the
 * technical trace behind a switch. Lays itself out side by side when it has room.
 */
export function RunPanel({ run, onRetry, linkToConversation, idleContent, className }: RunPanelProps) {
  const decided = Boolean(run.result?.decision)
  const steps = useMemo(() => deriveSteps(run.events, run.phase, decided), [run.events, run.phase, decided])
  const fallback = useMemo(() => detectFallback(run.events, run.result), [run.events, run.result])
  const [showTrace, setShowTrace] = useTracePreference()
  const traceId = useId()

  const activeIndex = steps.findIndex((s) => s.status === 'active')
  const active = activeIndex === -1 ? undefined : steps[activeIndex]

  let announcement = ''
  if (run.phase === 'running') announcement = active ? `Step ${activeIndex + 1} of ${AGENT_STEPS.length}: ${active.label}` : 'Starting'
  else if (run.phase === 'done' && run.result) announcement = `Finished. ${decisionMeta(run.result.decision).label}. ${run.result.summary}`
  else if (run.phase === 'failed') announcement = 'The assistant stopped before it finished.'

  // An HTTP error before any step (busy, not found): there is no run to show, just the error.
  if (run.phase === 'failed' && run.events.length === 0) {
    return (
      <div className={className}>
        <InlineError error={run.error} title="The assistant could not start" onRetry={onRetry} />
      </div>
    )
  }

  return (
    <div className={cn('@container', className)}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className="space-y-5">
        {fallback ? <FallbackNotice /> : null}

        <div className="grid gap-6 @2xl:grid-cols-[220px_minmax(0,1fr)]">
          <StepTimeline steps={steps} />
          <div className="min-w-0">
            {run.phase === 'idle' ? idleContent : null}
            {run.phase === 'running' ? <Working step={active} mode={run.mode} /> : null}
            {run.phase === 'failed' ? (
              <InlineError error={run.error} title="The assistant stopped before it finished" onRetry={onRetry} />
            ) : null}
            {run.phase === 'done' && run.result ? <RunResultView result={run.result} events={run.events} linkToConversation={linkToConversation} /> : null}
          </div>
        </div>

        {run.phase === 'idle' ? null : (
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch id={traceId} size="sm" checked={showTrace} onCheckedChange={setShowTrace} aria-describedby={`${traceId}-hint`} />
                <Label htmlFor={traceId}>Technical trace</Label>
              </div>
              <span className="text-xs text-subtle tabular-nums">{pluralize(run.events.length, 'event')}</span>
            </div>
            <p id={`${traceId}-hint`} className="mt-1 text-xs text-muted">
              The plan, reasoning and every tool call with its data, exactly as the agent produced them.
            </p>
            {showTrace ? <RunTrace events={run.events} className="mt-3" /> : null}
          </div>
        )}
      </div>
    </div>
  )
}
