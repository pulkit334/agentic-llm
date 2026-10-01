import { CancelFollowUpButton } from '@/components/followup/CancelFollowUpButton'
import { EditFollowUpButton } from '@/components/followup/EditFollowUpDialog'
import type { FollowUp } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface FollowupActionsProps {
  followup: FollowUp
  className?: string
}

/**
 * Edit and Cancel for a pending follow-up, using the shared follow-up dialogs (the same ones as
 * the Scheduled page). Renders nothing once it has been sent or cancelled.
 */
export function FollowupActions({ followup, className }: FollowupActionsProps) {
  if (followup.status !== 'pending') return null
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <EditFollowUpButton followup={followup} />
      <CancelFollowUpButton followup={followup} />
    </div>
  )
}
