import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from './spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ' +
  'transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:size-4'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-border bg-surface-2 text-foreground hover:bg-surface-3',
  outline: 'border border-border-strong bg-transparent text-foreground hover:bg-surface-2',
  ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-foreground',
  destructive: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15',
  link: 'h-auto rounded-sm px-0 text-foreground underline-offset-4 hover:underline',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-sm',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
  icon: 'size-8',
  'icon-sm': 'size-7',
}

/**
 * Class names for something that should look like a button (e.g. a router <Link>):
 * `<Link to="/app/new" className={buttonVariants({ variant: 'primary' })}>New follow-up</Link>`
 */
export function buttonVariants({
  variant = 'secondary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(base, variants[variant], variant === 'link' ? 'h-auto px-0' : sizes[size], className)
}

export interface ButtonProps extends ComponentProps<'button'> {
  /** primary = solid white on dark / solid black on light. Default: secondary. */
  variant?: ButtonVariant
  /** sm 28px, md 32px (default), lg 40px, icon 32px square, icon-sm 28px square. */
  size?: ButtonSize
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean
}

/**
 * Button. Icon-only buttons (size "icon"/"icon-sm") need an `aria-label`.
 * Defaults to type="button" so it never submits a form by accident; pass type="submit" in forms.
 */
export function Button({ variant = 'secondary', size = 'md', loading = false, disabled, className, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  )
}
