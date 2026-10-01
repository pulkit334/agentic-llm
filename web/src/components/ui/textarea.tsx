import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { fieldClasses } from './input'

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** Marks the field invalid (red border + aria-invalid). */
  invalid?: boolean
  /** Use the mono font (pasted email threads, raw text). */
  mono?: boolean
}

export function Textarea({ className, invalid, mono, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(
        fieldClasses,
        'block min-h-16 resize-y px-3 py-2 text-base sm:text-sm',
        mono && 'font-mono text-sm leading-5 sm:text-xs sm:leading-5',
        'scrollbar-thin',
        className,
      )}
      {...props}
    />
  )
}
