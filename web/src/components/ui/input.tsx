import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Shared field chrome for Input and Textarea. */
export const fieldClasses =
  'w-full min-w-0 rounded-md border border-border-strong bg-background text-foreground placeholder:text-subtle ' +
  'transition-colors duration-150 ease-out hover:border-subtle/60 ' +
  'focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-surface ' +
  'aria-invalid:border-danger/70 aria-invalid:focus-visible:outline-danger/70'

export interface InputProps extends ComponentProps<'input'> {
  /** Marks the field invalid (red border + aria-invalid). */
  invalid?: boolean
}

export function Input({ className, invalid, type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(fieldClasses, 'h-9 px-3 text-base sm:h-8 sm:text-sm', className)}
      {...props}
    />
  )
}
