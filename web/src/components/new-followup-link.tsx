import { SquarePen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants, type ButtonSize, type ButtonVariant } from '@/components/ui/button'

export interface NewFollowUpLinkProps {
  /** Default primary (the page's main action). Use "secondary" when another primary is nearby. */
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/** The one "New follow-up" call to action, with the same icon as the sidebar entry. */
export function NewFollowUpLink({ variant = 'primary', size = 'md', className }: NewFollowUpLinkProps) {
  return (
    <Link to="/app/new" className={buttonVariants({ variant, size, className })}>
      <SquarePen aria-hidden />
      New follow-up
    </Link>
  )
}
