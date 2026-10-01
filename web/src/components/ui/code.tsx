import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Inline code chip for identifiers shown as data: tool names, table names, matched phrases.
 * For code inside running text, use a plain <code className="font-mono"> instead.
 *
 * <Code>schedule_followup</Code>
 */
export function Code({ className, ...props }: ComponentProps<'code'>) {
  return (
    <code
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-sm border border-border bg-surface-2 px-1.5 font-mono text-xs text-muted',
        className,
      )}
      {...props}
    />
  )
}
