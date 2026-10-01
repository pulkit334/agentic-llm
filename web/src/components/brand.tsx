import { cn } from '@/lib/utils'

/** The Followup mark: a reply arrow in a rounded square. Inherits the current text colour. */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 9v6.5a4 4 0 0 0 4 4h8" style={{ stroke: 'var(--background)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18.5 15.5 4 4-4 4" style={{ stroke: 'var(--background)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Logo + "Followup" wordmark. */
export function Wordmark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-foreground', className)}>
      <Logo size={size} />
      <span className="text-base font-semibold tracking-tight">Followup</span>
    </span>
  )
}
