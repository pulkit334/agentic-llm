import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Keyboard key hint, e.g. <Kbd>Esc</Kbd>. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-strong bg-surface-2 px-1 font-mono text-xs font-medium text-muted',
        className,
      )}
      {...props}
    />
  )
}
