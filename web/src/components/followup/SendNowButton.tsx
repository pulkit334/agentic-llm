import { useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ApiError, errorMessage, type FollowUp } from '@/lib/api'
import { invalidateWorkflow } from '@/lib/query'
import { useSendFollowupNow } from '@/lib/queries'

export interface SendNowButtonProps {
  /** A pending follow-up. Nothing renders for sent or cancelled ones. */
  followup: FollowUp
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/** Sends a pending follow-up immediately. The server still blocks it if they replied or opted out. */
export function SendNowButton({ followup, variant = 'secondary', size = 'sm', className }: SendNowButtonProps) {
  const client = useQueryClient()
  const send = useSendFollowupNow()
  if (followup.status !== 'pending') return null

  const onClick = () => {
    if (send.isPending) return
    send
      .mutateAsync(followup.id)
      .then((sent) => toast.success('Email sent', `Sent to ${sent.contact.name} just now.`))
      .catch((error: unknown) => {
        toast.error('Not sent', errorMessage(error))
        if (error instanceof ApiError && (error.status === 409 || error.status === 404)) void invalidateWorkflow(client)
      })
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      loading={send.isPending}
      aria-label={`Send follow-up to ${followup.contact.name} now`}
    >
      <Send aria-hidden />
      Send now
    </Button>
  )
}
