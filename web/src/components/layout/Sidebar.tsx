import {
  BookOpen,
  CalendarClock,
  History,
  LayoutGrid,
  MessagesSquare,
  Send,
  SquarePen,
  type LucideIcon,
} from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { Wordmark } from '@/components/brand'
import { StatusDot } from '@/components/ui/badge'
import { EMAIL_MODE_LABELS } from '@/lib/format'
import { useOverview } from '@/lib/queries'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  count?: 'open' | 'scheduled'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/app/conversations', label: 'Conversations', icon: MessagesSquare, count: 'open' },
  { to: '/app/new', label: 'New follow-up', icon: SquarePen },
  { to: '/app/scheduled', label: 'Scheduled', icon: CalendarClock, count: 'scheduled' },
  { to: '/app/sent', label: 'Sent', icon: Send },
  { to: '/app/activity', label: 'Activity', icon: History },
  { to: '/app/how-it-works', label: 'How it works', icon: BookOpen },
]

const COUNT_LABELS = { open: 'open conversations', scheduled: 'pending follow-ups' } as const

/** Navigation column: wordmark, the seven app sections, and the system status at the bottom. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: overview } = useOverview()

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link to="/app" onClick={onNavigate} className="rounded-sm" aria-label="Followup overview">
          <Wordmark />
        </Link>
      </div>

      <nav aria-label="Main" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const count = item.count && overview ? overview.counts[item.count] : null
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150',
                      isActive ? 'bg-surface-2 text-foreground' : 'text-muted hover:bg-surface-2 hover:text-foreground',
                    )
                  }
                >
                  <item.icon aria-hidden className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {count ? (
                    <span className="font-mono text-xs text-subtle tabular-nums">
                      {count}
                      <span className="sr-only"> {COUNT_LABELS[item.count as keyof typeof COUNT_LABELS]}</span>
                    </span>
                  ) : null}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border px-4 py-3 text-xs text-muted">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-subtle">Email</dt>
          <dd className="truncate text-right">{overview ? EMAIL_MODE_LABELS[overview.email_mode] ?? overview.email_mode : '…'}</dd>
          <dt className="text-subtle">Agent</dt>
          <dd className="flex items-center justify-end gap-1.5 truncate">
            {overview ? (
              <>
                <StatusDot tone={overview.llm_available ? 'success' : 'warning'} />
                {overview.llm_available ? 'Smart AI ready' : 'Rules only'}
              </>
            ) : (
              '…'
            )}
          </dd>
        </dl>
      </div>
    </div>
  )
}

/** Fixed desktop sidebar (hidden below md; the top bar opens the same content in a sheet). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-border bg-surface md:block">
      <SidebarContent />
    </aside>
  )
}
