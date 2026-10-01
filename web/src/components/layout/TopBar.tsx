import { Menu } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { DemoClock } from './DemoClock'
import { UserMenu } from './UserMenu'

export interface TopBarProps {
  title: string
  /** Opens the navigation sheet on small screens. */
  onOpenNav: () => void
  /** A route is loading: shows a hairline progress bar along the bottom edge. */
  busy?: boolean
}

/** Sticky app bar: section title, demo clock, theme and account. */
export function TopBar({ title, onOpenNav, busy = false }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={onOpenNav} className="-ml-2 md:hidden">
        <Menu aria-hidden />
      </Button>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</p>
      <div className="flex shrink-0 items-center gap-1">
        <DemoClock />
        <ThemeToggle />
        <UserMenu />
      </div>
      {busy ? <div aria-hidden className="absolute inset-x-0 -bottom-px h-px animate-pulse bg-foreground" /> : null}
    </header>
  )
}
