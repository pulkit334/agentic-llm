import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { fieldClasses } from './input'

export interface SelectProps extends ComponentProps<'select'> {
  invalid?: boolean
  /** Class for the wrapper (width, margins). `className` styles the <select> itself. */
  wrapperClassName?: string
}

/**
 * Styled native <select> (fully accessible and keyboard friendly on every platform).
 *
 * <Select aria-label="Conversation" value={id} onChange={(e) => setId(e.target.value)}>
 *   <option value="">All conversations</option>
 *   ...
 * </Select>
 */
export function Select({ className, wrapperClassName, invalid, children, ...props }: SelectProps) {
  return (
    <div className={cn('relative inline-flex w-full min-w-0', wrapperClassName)}>
      <select
        aria-invalid={invalid || props['aria-invalid'] || undefined}
        className={cn(fieldClasses, 'h-9 appearance-none truncate pr-8 pl-3 text-base sm:h-8 sm:text-sm', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" />
    </div>
  )
}
