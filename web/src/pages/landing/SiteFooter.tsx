import { ArrowUpRight } from 'lucide-react'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { PROJECT } from '@/lib/product'

/** Project credits, source link and theme switch. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <Logo size={20} className="mt-px" />
          <p className="text-sm text-muted">
            {PROJECT.name} · Built for {PROJECT.event} by team <span className="font-mono text-foreground">{PROJECT.team}</span> · Problem
            statement <span className="font-mono text-foreground">{PROJECT.problem}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={PROJECT.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted transition-colors duration-150 hover:text-foreground"
          >
            Source on GitHub
            <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <ThemeToggle variant="segmented" />
        </div>
      </div>
    </footer>
  )
}
