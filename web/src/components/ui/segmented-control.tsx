import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  /** Shown as the option's title/tooltip text for extra context. */
  description?: string
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  /** Required: what the choice is about, e.g. "Agent mode". */
  'aria-label': string
  size?: 'sm' | 'md'
  /** Stretch options to fill the container. */
  fullWidth?: boolean
  className?: string
  disabled?: boolean
}

/**
 * One-of-N choice as a compact segmented control (radio group semantics).
 * Arrow keys move and select; Tab leaves the group.
 *
 * <SegmentedControl aria-label="Agent mode" value={mode} onChange={setMode}
 *   options={[{ value: 'llm', label: 'Smart AI' }, { value: 'rules', label: 'Rules' }]} />
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  fullWidth,
  className,
  disabled,
  ...aria
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement | null>(null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter((o) => !o.disabled)
    const index = enabled.findIndex((o) => o.value === value)
    let next: SegmentedOption<T> | undefined
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(index + 1) % enabled.length]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(index - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    if (!next) return
    e.preventDefault()
    onChange(next.value)
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={aria['aria-label']}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5',
        fullWidth && 'flex w-full',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            tabIndex={selected ? 0 : -1}
            title={option.description}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors duration-150',
              'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm',
              fullWidth && 'flex-1',
              selected ? 'bg-background text-foreground ring-1 ring-border-strong' : 'text-muted hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
