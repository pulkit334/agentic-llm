import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface AvatarProps {
  name: string | null | undefined
  /** sm 20px, md 28px (default), lg 36px. */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** Monochrome initials circle for a person. Decorative: show the name next to it. */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full border border-border-strong bg-surface-2 font-medium text-muted',
        size === 'sm' ? 'size-5 text-[10px] leading-none' : size === 'lg' ? 'size-9 text-sm' : 'size-7 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
