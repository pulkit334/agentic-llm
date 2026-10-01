import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export interface LabelProps extends ComponentProps<'label'> {
  /** Adds a subtle "Optional" marker after the label text. */
  optional?: boolean
}

export function Label({ className, optional, children, ...props }: LabelProps) {
  return (
    <label className={cn('inline-flex items-baseline gap-1.5 text-sm font-medium text-foreground', className)} {...props}>
      {children}
      {optional ? <span className="text-xs font-normal text-subtle">Optional</span> : null}
    </label>
  )
}
