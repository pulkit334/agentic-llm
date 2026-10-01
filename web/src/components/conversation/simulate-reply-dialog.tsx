import { useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle, useDialogClose } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { errorMessage, type ConversationDetail } from '@/lib/api'
import { firstName } from '@/lib/format'
import { useClock, useSimulateReply } from '@/lib/queries'

const MAX_BODY = 20000

/** Ready-made replies that show the three ways the assistant reacts to an answer. */
function presets(first: string): { label: string; text: string }[] {
  return [
    {
      label: 'Asks a question',
      text: `Hi,\n\nThanks for the note. Could you tell me what the next step would be?\n\nThanks,\n${first}`,
    },
    {
      label: 'Opts out',
      text: `Hi,\n\nThanks, but we are not interested any more. Please don't follow up on this.\n\nRegards,\n${first}`,
    },
    {
      label: 'Acknowledges',
      text: `Hi,\n\nThanks for the reminder. I will get back to you by the end of the week.\n\nBest,\n${first}`,
    },
  ]
}

function SimulateReplyForm({ conversation }: { conversation: ConversationDetail }) {
  const close = useDialogClose()
  const simulate = useSimulateReply()
  const { data: clock } = useClock()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const first = firstName(conversation.contact.name)
  const hasPending = conversation.followups.some((f) => f.status === 'pending')

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = body.trim()
    if (!text) {
      setError(`Write what ${first} says, or pick one of the quick replies.`)
      textareaRef.current?.focus()
      return
    }
    setError(null)
    // mutateAsync rather than per-call callbacks: those are dropped if the dialog unmounts while the
    // refreshed conversation loads. A failure is shown in the dialog from simulate.error.
    simulate
      .mutateAsync({ threadId: conversation.id, body: text })
      .then(() => {
        toast.success(
          `Reply from ${first} added`,
          hasPending
            ? 'The scheduled follow-up will be cancelled at its send time. Let the assistant decide to see how it answers.'
            : 'Let the assistant decide to see how it responds.',
        )
        close()
      })
      .catch(() => {})
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>Simulate a reply from {first}</DialogTitle>
        <DialogDescription>
          Demo control. Adds a message from {conversation.contact.name} at the simulated time{clock ? ` (${clock.local})` : ''}, as if they had just
          answered.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {simulate.isError ? (
          <Alert tone="danger" assertive title="Could not add the reply">
            {errorMessage(simulate.error)}
          </Alert>
        ) : null}

        <div role="group" aria-labelledby="quick-replies-label" className="flex flex-col gap-1.5">
          <span id="quick-replies-label" className="text-sm font-medium text-foreground">
            Quick replies
          </span>
          <div className="flex flex-wrap gap-2">
            {presets(first).map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant="outline"
                aria-pressed={body === preset.text}
                className="aria-pressed:border-foreground aria-pressed:bg-surface-2"
                onClick={() => {
                  setBody(preset.text)
                  setError(null)
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <Field label="Reply" error={error} hint="Next time the assistant runs, a question gets an answer, an opt-out closes the conversation, and any other reply means it stops chasing.">
          <Textarea
            ref={textareaRef}
            value={body}
            rows={7}
            maxLength={MAX_BODY}
            onChange={(e) => {
              setBody(e.target.value)
              if (error) setError(null)
            }}
            placeholder={`What ${first} writes back…`}
          />
        </Field>

        {hasPending ? (
          <Alert>A follow-up is scheduled. Because {first} replied, it will be cancelled automatically when its send time comes.</Alert>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={simulate.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={simulate.isPending}>
          Add reply
        </Button>
      </DialogFooter>
    </form>
  )
}

export interface SimulateReplyDialogProps {
  conversation: ConversationDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Demo control: the contact answers now, on the simulated clock. */
export function SimulateReplyDialog({ conversation, open, onOpenChange }: SimulateReplyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SimulateReplyForm conversation={conversation} />
    </Dialog>
  )
}
