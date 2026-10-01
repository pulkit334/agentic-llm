import { Clock, FastForward, RotateCcw, Send } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { errorMessage, type DueResult } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatTimeZone, pluralize } from '@/lib/format'
import { useAdvanceClock, useClock, useResetDemo, useRunDue } from '@/lib/queries'
import { cn } from '@/lib/utils'

const STEPS: { hours: number; label: string; long: string }[] = [
  { hours: 6, label: '+6 h', long: 'Advance 6 hours' },
  { hours: 24, label: '+1 day', long: 'Advance 1 day' },
  { hours: 72, label: '+3 days', long: 'Advance 3 days' },
]

/** "2 follow-ups sent, 1 cancelled" (or a plain "nothing was due"). */
export function summarizeDue(results: DueResult[]): string {
  if (!results.length) return 'No follow-ups were due.'
  const count = (status: DueResult['status']) => results.filter((r) => r.status === status).length
  const parts: string[] = []
  const sent = count('sent')
  const cancelled = count('cancelled')
  const failed = count('failed')
  if (sent) parts.push(`${pluralize(sent, 'follow-up')} sent`)
  if (cancelled) parts.push(`${cancelled} cancelled before sending`)
  if (failed) parts.push(`${failed} failed`)
  return `${parts.join(', ')}.`
}

/** Top-bar pill showing the simulated time, with the demo controls in a popover. */
export function DemoClock() {
  const { data: clock, isPending } = useClock()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const advance = useAdvanceClock()
  const runDue = useRunDue()
  const reset = useResetDemo()
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const busy = advance.isPending || runDue.isPending

  const onAdvance = (hours: number) => {
    advance.mutate(hours, {
      onSuccess: (res) => {
        const summary = summarizeDue(res.results)
        setLastResult(summary)
        toast.success(`Clock moved to ${res.clock.local}`, summary)
      },
      onError: (err) => toast.error('Could not move the clock', errorMessage(err)),
    })
  }

  const onRunDue = () => {
    runDue.mutate(undefined, {
      onSuccess: (res) => {
        const summary = summarizeDue(res.results)
        setLastResult(summary)
        toast(res.results.length ? { title: 'Due follow-ups processed', description: summary, tone: 'success' } : { title: 'Nothing was due', description: 'No pending follow-up has reached its send time yet.' })
      },
      onError: (err) => toast.error('Could not send due follow-ups', errorMessage(err)),
    })
  }

  const onReset = () => {
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirmReset(false)
        setLastResult(null)
        toast.success('Demo data reset', 'Sample conversations and the clock are back to the start. Accounts were kept.')
        navigate('/app')
      },
      onError: (err) => toast.error('Could not reset the demo', errorMessage(err)),
    })
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={clock ? `Demo clock: ${clock.local}. Open demo controls` : 'Open demo controls'}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 rounded-full px-2.5 font-mono text-xs text-muted hover:text-foreground')}
        >
          <Clock aria-hidden />
          {isPending ? <Skeleton className="h-3 w-24" /> : <span className="tabular-nums">{clock?.local ?? 'Clock'}</span>}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0" aria-label="Demo controls">
          <div className="px-4 pt-4 pb-3">
            <p className="text-xs text-muted">Simulated time</p>
            <p className="mt-1 font-mono text-lg font-medium text-foreground tabular-nums">{clock?.local ?? '—'}</p>
            <p className="mt-0.5 text-xs text-muted">
              {clock ? `${formatTimeZone(clock.tz)} time. ` : ''}It moves only when you advance it.
            </p>
          </div>
          <Separator />
          <div className="space-y-3 px-4 py-3">
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Advance the clock</p>
              <div className="grid grid-cols-3 gap-2">
                {STEPS.map((step) => (
                  <Button
                    key={step.hours}
                    size="sm"
                    aria-label={step.long}
                    disabled={busy}
                    loading={advance.isPending && advance.variables === step.hours}
                    onClick={() => onAdvance(step.hours)}
                  >
                    {advance.isPending && advance.variables === step.hours ? null : <FastForward aria-hidden />}
                    {step.label}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Follow-ups that fall due on the way are re-checked and sent at their scheduled time.</p>
            </div>
            <Button variant="primary" size="sm" className="w-full" disabled={busy} loading={runDue.isPending} onClick={onRunDue}>
              {runDue.isPending ? null : <Send aria-hidden />}
              Send due now
            </Button>
            {lastResult ? (
              <p className="text-xs text-muted" role="status">
                Last run: {lastResult}
              </p>
            ) : null}
          </div>
          {isAdmin ? (
            <>
              <Separator />
              <div className="px-2 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-danger hover:text-danger"
                  onClick={() => {
                    setOpen(false)
                    setConfirmReset(true)
                  }}
                >
                  <RotateCcw aria-hidden />
                  Reset demo data
                </Button>
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="This reloads the sample conversations and the starting clock, and clears follow-ups, sent emails and activity. Accounts are kept."
        confirmLabel="Reset demo data"
        tone="danger"
        loading={reset.isPending}
        onConfirm={onReset}
      />
    </>
  )
}
