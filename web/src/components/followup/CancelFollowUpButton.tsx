import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { ApiError, errorMessage, type FollowUp } from '@/lib/api'
import { formatTimeZone, truncate } from '@/lib/format'
import { invalidateWorkflow } from '@/lib/query'
import { useCancelFollowup } from '@/lib/queries'

/** Same limit as the API. */
const MAX_REASON = 500

export interface CancelFollowUpButtonProps {
  /** A pending follow-up. Nothing renders for sent or cancelled ones. */
  followup: FollowUp
  variant?: ButtonVariant
  size?: ButtonSize
  /** Button text. Default "Cancel follow-up". */
  label?: string
  className?: string
  /** Called with the cancelled follow-up (caches are already refreshed). */
  onCancelled?: (followup: FollowUp) => void
}

/**
 * Cancel a pending follow-up after a confirmation, with an optional reason that is stored with
 * it and shows up in the activity log.
 */
export function CancelFollowUpButton({ followup, variant = 'ghost', size = 'sm', label = 'Cancel follow-up', className, onCancelled }: CancelFollowUpButtonProps) {
  const client = useQueryClient()
  const cancel = useCancelFollowup()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (followup.status !== 'pending') return null

  const { contact } = followup

  const openDialog = () => {
    setReason('')
    cancel.reset()
    setOpen(true)
  }

  // mutateAsync rather than per-call callbacks: the refreshed lists usually move this row to the
  // Cancelled tab (unmounting this button) before per-call callbacks would run.
  const onConfirm = () => {
    cancel
      .mutateAsync({ id: followup.id, reason: reason.trim() || undefined })
      .then((cancelled) => {
        setOpen(false)
        toast.success('Follow-up cancelled', `${contact.name} won't receive “${truncate(followup.subject, 60)}”.`)
        onCancelled?.(cancelled)
      })
      .catch((error: unknown) => {
        // Already sent (409) or gone (404): nothing left to cancel. Say so and refresh the lists.
        // Other errors stay in the dialog (see cancel.error below) so the person can retry.
        if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
          setOpen(false)
          toast.error('Could not cancel the follow-up', errorMessage(error))
          void invalidateWorkflow(client)
        }
      })
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openDialog} aria-haspopup="dialog">
        <X aria-hidden />
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this follow-up?"
        description={
          <>
            The email to {contact.name} set for {followup.send_at_local} ({formatTimeZone(contact.timezone)} time) won't be sent. The conversation stays
            open, so you can run the assistant again later.
          </>
        }
        confirmLabel="Cancel follow-up"
        cancelLabel="Keep it"
        tone="danger"
        loading={cancel.isPending}
        onConfirm={onConfirm}
      >
        <div className="space-y-3">
          {cancel.isError ? (
            <Alert tone="danger" assertive title="The follow-up was not cancelled">
              {errorMessage(cancel.error)}
            </Alert>
          ) : null}
          <Field label="Reason" optional hint="Saved with the follow-up and shown in the activity log.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={MAX_REASON}
              placeholder="For example: we spoke on the phone instead"
              disabled={cancel.isPending}
            />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  )
}
