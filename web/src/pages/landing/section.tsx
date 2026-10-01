import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export { SectionLink } from '@/components/section-link'

export interface SectionProps {
  id: string
  /** Small label above the heading. */
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A landing-page section: hairline top border, max-width container, eyebrow + h2 + lead paragraph.
 * Focusable (tabIndex -1) so in-page links can move keyboard focus to it.
 */
export function Section({ id, eyebrow, title, description, children, className }: SectionProps) {
  const titleId = `${id}-title`
  return (
    <section id={id} tabIndex={-1} aria-labelledby={titleId} className={cn('scroll-mt-14 border-t border-border outline-none', className)}>
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <header className="max-w-2xl">
          <p className="font-mono text-xs text-subtle">{eyebrow}</p>
          <h2 id={titleId} className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {title}
          </h2>
          {description ? <p className="mt-3 text-lg text-muted">{description}</p> : null}
        </header>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  )
}
