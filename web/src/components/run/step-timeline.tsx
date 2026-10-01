import { Check, Minus, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { StepStatus, StepView } from './steps'

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: 'not started',
  active: 'in progress',
  done: 'done',
  skipped: 'not needed',
  failed: 'stopped here',
}

function StepIcon({ status }: { status: StepStatus }) {
  const base = 'relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full'
  switch (status) {
    case 'active':
      return (
        <span className={cn(base, 'border border-foreground bg-background text-foreground')}>
          <Spinner size={12} />
        </span>
      )
    case 'done':
      return (
        <span className={cn(base, 'bg-primary text-primary-foreground')}>
          <Check aria-hidden className="size-3" strokeWidth={2.5} />
        </span>
      )
    case 'skipped':
      return (
        <span className={cn(base, 'border border-dashed border-border-strong bg-background text-subtle')}>
          <Minus aria-hidden className="size-3" />
        </span>
      )
    case 'failed':
      return (
        <span className={cn(base, 'border border-danger/40 bg-danger/10 text-danger')}>
          <X aria-hidden className="size-3" strokeWidth={2.5} />
        </span>
      )
    case 'pending':
      return <span className={cn(base, 'border border-border-strong bg-background')} />
  }
}

export interface StepTimelineProps {
  steps: StepView[]
  className?: string
}

/**
 * The seven steps of a run as a vertical checklist: pending, in progress (spinner), done (check),
 * not needed (dash) or stopped (cross), each with one plain line about what happened.
 */
export function StepTimeline({ steps, className }: StepTimelineProps) {
  return (
    <ol aria-label="Assistant steps" className={cn('flex flex-col', className)}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        const reached = step.status === 'done' || step.status === 'skipped'
        return (
          <li key={step.id} aria-current={step.status === 'active' ? 'step' : undefined} className={cn('relative flex gap-3', !last && 'pb-4')}>
            {last ? null : (
              <span
                aria-hidden
                className={cn('absolute top-5 bottom-0 left-[9.5px] w-px transition-colors duration-150', reached ? 'bg-foreground/30' : 'bg-border')}
              />
            )}
            <StepIcon status={step.status} />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm leading-5 font-medium',
                  step.status === 'pending' || step.status === 'skipped' ? 'text-subtle' : step.status === 'failed' ? 'text-danger' : 'text-foreground',
                )}
              >
                {step.label}
                <span className="sr-only">, {STATUS_TEXT[step.status]}</span>
              </p>
              {step.status === 'skipped' ? (
                <p className="mt-0.5 text-xs text-subtle">Not needed for this decision</p>
              ) : step.detail && step.status !== 'pending' ? (
                <p key={step.detail} className="mt-0.5 line-clamp-2 animate-fade-in text-xs break-words text-muted" title={step.detail}>
                  {step.detail}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
