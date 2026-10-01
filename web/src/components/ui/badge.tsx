import type { ComponentProps } from 'react'
import { TONE_DOT, type Tone } from '@/lib/format'
import { cn } from '@/lib/utils'

export type BadgeTone = Tone | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-2 text-muted',
  outline: 'border-border-strong bg-transparent text-muted',
  info: 'border-info/25 bg-info/10 text-info',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
}

const dots: Record<BadgeTone, string> = { ...TONE_DOT, outline: TONE_DOT.neutral }

export interface BadgeProps extends ComponentProps<'span'> {
  /** neutral (default) | outline | info (scheduled) | success (sent) | warning (skipped, replied) | danger (blocked, failed) */
  tone?: BadgeTone
  /** Leading status dot. */
  dot?: boolean
  size?: 'sm' | 'md'
  /** Monospace text (counts, ids). */
  mono?: boolean
}

/** Small status marker. The only place colour appears in the UI. */
export function Badge({ tone = 'neutral', dot, size = 'md', mono, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border font-medium',
        size === 'sm' ? 'h-5 px-1.5 text-xs' : 'h-6 px-2 text-xs',
        mono && 'font-mono tabular-nums',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <StatusDot tone={tone} /> : null}
      {children}
    </span>
  )
}

/**
 * The 6px status dot on its own (activity rows, the sidebar's agent status). Decorative: put the
 * status in words next to it. Align it with `mt-*` when it sits beside a text line.
 */
export function StatusDot({ tone = 'neutral', className }: { tone?: BadgeTone; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', dots[tone], className)} />
}
