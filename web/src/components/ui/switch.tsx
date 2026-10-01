import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<ComponentProps<'button'>, 'onChange'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  size?: 'sm' | 'md'
}

/**
 * On/off toggle (role="switch"). Label it with `aria-label` or a <Label htmlFor={id}>.
 *
 * <div className="flex items-center gap-2">
 *   <Switch id="trace" checked={showTrace} onCheckedChange={setShowTrace} />
 *   <Label htmlFor="trace">Technical trace</Label>
 * </div>
 */
export function Switch({ checked, onCheckedChange, size = 'md', className, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'border-primary bg-primary' : 'border-border-strong bg-surface-3',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block rounded-full shadow-none transition-transform duration-150',
          size === 'sm' ? 'size-3' : 'size-4',
          checked ? 'bg-primary-foreground' : 'bg-foreground/70',
          checked ? (size === 'sm' ? 'translate-x-3' : 'translate-x-4') : 'translate-x-px',
        )}
      />
    </button>
  )
}
