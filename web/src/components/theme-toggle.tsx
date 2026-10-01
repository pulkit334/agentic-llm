import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { buttonVariants } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { SegmentedControl } from './ui/segmented-control'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export interface ThemeToggleProps {
  /** "menu" (default): icon button with a menu, for the top bar. "segmented": three icon radios, for footers. */
  variant?: 'menu' | 'segmented'
  className?: string
}

/** System / Light / Dark switch. The choice is saved in localStorage. */
export function ThemeToggle({ variant = 'menu', className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()

  if (variant === 'segmented') {
    return (
      <SegmentedControl
        aria-label="Theme"
        size="sm"
        value={theme}
        onChange={setTheme}
        className={className}
        options={OPTIONS.map((o) => ({
          value: o.value,
          label: <span className="sr-only">{o.label}</span>,
          icon: <o.icon aria-hidden />,
          description: o.label,
        }))}
      />
    )
  }

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Theme" title="Theme" className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), className)}>
        <CurrentIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {OPTIONS.map((o) => (
          <DropdownMenuRadioItem key={o.value} checked={theme === o.value} icon={<o.icon aria-hidden />} onSelect={() => setTheme(o.value)}>
            {o.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
