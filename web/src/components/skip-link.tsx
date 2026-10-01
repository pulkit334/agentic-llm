import type { MouseEvent } from 'react'

/**
 * "Skip to content" for keyboard users: the first focusable element of a page. It moves focus to
 * the element with id `target` (a <main tabIndex={-1}>) without a hash navigation, which the
 * router would otherwise treat as a new history entry.
 */
export function SkipLink({ target = 'main' }: { target?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(target)
    if (!el) return
    e.preventDefault()
    el.focus()
  }
  return (
    <a
      href={`#${target}`}
      onClick={onClick}
      className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  )
}
