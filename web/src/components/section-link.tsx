import { Link, type LinkProps } from 'react-router-dom'
import { focusSection } from './focus-section'

export interface SectionLinkProps extends Omit<LinkProps, 'to'> {
  /** Id of the target section. */
  section: string
}

/**
 * In-page link to a section (landing page, How it works): a router navigation to `#id`, so the
 * URL can be shared, then focus moves to the section.
 */
export function SectionLink({ section, onClick, children, ...props }: SectionLinkProps) {
  return (
    <Link
      to={`#${section}`}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        focusSection(section)
      }}
      {...props}
    >
      {children}
    </Link>
  )
}
