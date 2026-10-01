import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** The full text of an email, line breaks kept, in an inset panel. */
export function EmailBody({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-background px-4 py-3 text-sm leading-6 break-words whitespace-pre-wrap text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
