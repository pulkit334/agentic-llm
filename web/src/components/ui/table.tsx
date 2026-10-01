import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Data table with hairline rows. Wraps in a horizontally scrollable, bordered container.
 *
 * <Table>
 *   <TableHeader><TableRow><TableHead>Contact</TableHead>...</TableRow></TableHeader>
 *   <TableBody><TableRow interactive onClick={...}><TableCell>...</TableCell></TableRow></TableBody>
 * </Table>
 *
 * Pass `bare` to drop the outer border (e.g. when the table sits inside a Card).
 */
export function Table({ className, bare, ...props }: ComponentProps<'table'> & { bare?: boolean }) {
  return (
    <div className={cn('scrollbar-thin relative w-full overflow-x-auto', !bare && 'rounded-lg border border-border bg-surface')}>
      <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border [&_tr]:hover:bg-transparent', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, interactive, ...props }: ComponentProps<'tr'> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors duration-150',
        interactive && 'cursor-pointer hover:bg-surface-2 focus-within:bg-surface-2',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4', className)}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 align-middle first:pl-4 last:pr-4', className)} {...props} />
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('mt-3 text-xs text-muted', className)} {...props} />
}
