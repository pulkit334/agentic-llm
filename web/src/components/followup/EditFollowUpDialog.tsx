import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { ApiError, errorMessage, type FollowUp } from '@/lib/api'
import { contactTypeLabel, firstName, formatRelative, formatTimeZone, pluralize } from '@/lib/format'
import { invalidateWorkflow } from '@/lib/query'
import { useNow, useStrategies, useUpdateFollowup } from '@/lib/queries'

/** Same limits as the API (followups.subject is VARCHAR(500)). */
const MAX_SUBJECT = 500
const MAX_BODY = 20000

/** 409 / 404: the follow-up was sent, cancelled or removed while the dialog was open. */
function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404)
}

function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export interface EditFollowUpDialogProps {
  /** A pending follow-up. */
  followup: FollowUp
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the saved follow-up after a successful edit (caches are already refreshed). */
  onSaved?: (followup: FollowUp) => void
}

/**
 * Edit the subject and wording of a pending follow-up before it goes out.
 * Only changed fields are sent; the server rejects edits to follow-ups that are no longer pending.
 */
export function EditFollowUpDialog({ followup, open, onOpenChange, onSaved }: EditFollowUpDialogProps) {
  // The form (and its save request) mounts fresh on every opening; it reports when a save is in
  // flight so the dialog cannot be dismissed half-way.
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)} dismissible={!busy} size="lg">
      <EditFollowUpForm followup={followup} onBusyChange={setBusy} onClose={() => onOpenChange(false)} onSaved={onSaved} />
    </Dialog>
  )
}

function EditFollowUpForm({
  followup,
  onBusyChange,
  onClose,
  onSaved,
}: {
  followup: FollowUp
  onBusyChange: (busy: boolean) => void
  onClose: () => void
  onSaved?: (followup: FollowUp) => void
}) {
  const client = useQueryClient()
  const update = useUpdateFollowup()
  const now = useNow()
  const { data: strategies } = useStrategies()
  const [subject, setSubject] = useState(followup.subject)
  const [body, setBody] = useState(followup.body)
  const [submitted, setSubmitted] = useState(false)

  const { contact } = followup
  const nextSubject = subject.trim()
  const nextBody = body.trim()
  const subjectError = submitted && !nextSubject ? 'Add a subject line.' : undefined
  const bodyError = submitted && !nextBody ? 'Write the message before saving.' : undefined
  const changed = nextSubject !== followup.subject.trim() || nextBody !== followup.body.trim()
  const gone = isGone(update.error)
  const busy = update.isPending

  useEffect(() => {
    onBusyChange(busy)
  }, [busy, onBusyChange])
  useEffect(() => () => onBusyChange(false), [onBusyChange])

  const words = wordCount(body)
  const target = strategies?.types[contact.type]?.length
  const bodyHint = target ? `${pluralize(words, 'word')}. ${contactTypeLabel(contact.type)} emails aim for ${target}.` : pluralize(words, 'word')

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitted(true)
    if (!nextSubject || !nextBody || !changed || busy) return
    const patch: { subject?: string; body?: string } = {}
    if (nextSubject !== followup.subject) patch.subject = nextSubject
    if (nextBody !== followup.body) patch.body = nextBody
    // mutateAsync so the outcome is handled even if a list refresh unmounts the caller first.
    update
      .mutateAsync({ id: followup.id, ...patch })
      .then((saved) => {
        toast.success('Follow-up updated', `It still goes out ${saved.send_at_local} (${formatTimeZone(saved.contact.timezone)} time).`)
        onSaved?.(saved)
        onClose()
      })
      .catch((error: unknown) => {
        // Shown in the form via update.error. If it was sent or cancelled meanwhile, refresh the
        // lists so the row moves to the right tab.
        if (isGone(error)) void invalidateWorkflow(client)
      })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <DialogHeader>
        <DialogTitle>Edit follow-up</DialogTitle>
        <DialogDescription>
          To {contact.name} ({contact.email}). Goes out {followup.send_at_local}, {formatTimeZone(contact.timezone)} time ({formatRelative(followup.send_at, now)}).
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {update.error ? (
          <Alert tone="danger" assertive title={gone ? 'This follow-up can no longer be edited' : 'Your changes were not saved'}>
            {errorMessage(update.error)}
          </Alert>
        ) : null}

        <Field label="Subject" error={subjectError}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_SUBJECT} autoComplete="off" disabled={gone || busy} />
        </Field>

        <Field label="Message" hint={bodyHint} error={bodyError}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} maxLength={MAX_BODY} disabled={gone || busy} className="leading-6" />
        </Field>

        <p className="text-xs text-muted">
          Just before sending, the assistant checks the conversation again. If {firstName(contact.name)} replies first, this follow-up is cancelled
          automatically.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {changed && !gone ? 'Discard changes' : 'Close'}
        </Button>
        {gone ? null : (
          <Button type="submit" variant="primary" loading={busy} disabled={!changed}>
            Save changes
          </Button>
        )}
      </DialogFooter>
    </form>
  )
}

export interface EditFollowUpButtonProps {
  /** A pending follow-up. Nothing renders for sent or cancelled ones. */
  followup: FollowUp
  variant?: ButtonVariant
  size?: ButtonSize
  /** Button text. Default "Edit". */
  label?: string
  className?: string
  onSaved?: (followup: FollowUp) => void
}

/** "Edit" button that opens EditFollowUpDialog. */
export function EditFollowUpButton({ followup, variant = 'secondary', size = 'sm', label = 'Edit', className, onSaved }: EditFollowUpButtonProps) {
  const [open, setOpen] = useState(false)
  if (followup.status !== 'pending') return null
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={label === 'Edit' ? `Edit follow-up to ${followup.contact.name}` : undefined}
      >
        <Pencil aria-hidden />
        {label}
      </Button>
      <EditFollowUpDialog followup={followup} open={open} onOpenChange={setOpen} onSaved={onSaved} />
    </>
  )
}
