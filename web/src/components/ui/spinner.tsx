import { cn } from '@/lib/utils'

export interface SpinnerProps {
  /** Pixel size of the spinner. Default 16. */
  size?: number
  className?: string
  /** Accessible label. Omit when the spinner sits inside something that already announces the busy state. */
  label?: string
}

/** A thin rotating ring that inherits the current text colour. */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn('shrink-0 animate-spin', className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Centered spinner for whole-page waits (session check, lazy route). */
export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-muted" role="status" aria-live="polite">
      <Spinner size={20} />
      <span className="sr-only">{label}</span>
    </div>
  )
}
