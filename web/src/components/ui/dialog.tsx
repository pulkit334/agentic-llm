import { X } from 'lucide-react'
import { createContext, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button, type ButtonVariant } from './button'

interface DialogContextValue {
  titleId: string
  descriptionId: string
  close: () => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

function useDialogContext(component: string) {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Dialog>`)
  return ctx
}

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** sm 400px, md 512px (default), lg 640px. Ignored for side="left". */
  size?: 'sm' | 'md' | 'lg'
  /** "center" (default) or "left" (a full-height sheet, used for the mobile navigation). */
  side?: 'center' | 'left'
  /** Hide the close (X) button in the corner. */
  hideClose?: boolean
  /** Close when the backdrop is clicked. Default true. */
  dismissible?: boolean
  className?: string
}

/**
 * Modal dialog built on the native <dialog> element: focus is kept inside, the page behind is
 * inert, Escape closes it and focus returns to whatever opened it.
 *
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogHeader>
 *     <DialogTitle>Simulate a reply</DialogTitle>
 *     <DialogDescription>Pretend Rahul answered now.</DialogDescription>
 *   </DialogHeader>
 *   <DialogBody>...</DialogBody>
 *   <DialogFooter>...</DialogFooter>
 * </Dialog>
 *
 * Children are mounted only while open, so forms inside start fresh each time.
 */
export function Dialog({ open, onOpenChange, children, size = 'md', side = 'center', hideClose, dismissible = true, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // Make sure a dialog that unmounts while open releases the page.
  useEffect(() => {
    const dialog = ref.current
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  const close = () => onOpenChange(false)

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        // Escape: let React own the state.
        e.preventDefault()
        if (dismissible) close()
      }}
      onClose={() => {
        if (open) onOpenChange(false)
      }}
      onMouseDown={(e) => {
        // A press on the <dialog> element itself (not its content) is a press on the backdrop.
        if (dismissible && e.target === e.currentTarget) close()
      }}
      className={cn(
        'm-0 max-h-none max-w-none border-0 bg-transparent p-0 text-foreground backdrop:bg-overlay',
        'open:flex',
        side === 'center' ? 'inset-0 h-dvh w-screen items-start justify-center overflow-y-auto px-4 py-[10vh]' : 'inset-0 h-dvh w-screen justify-start',
      )}
    >
      {open ? (
        <DialogContext.Provider value={{ titleId, descriptionId, close }}>
          <div
            className={cn(
              'relative flex flex-col border border-border-strong bg-surface shadow-dialog',
              side === 'center'
                ? cn('w-full animate-pop-in rounded-lg', size === 'sm' ? 'max-w-[400px]' : size === 'lg' ? 'max-w-[640px]' : 'max-w-[512px]')
                : 'h-full w-[min(300px,85vw)] animate-slide-in-left border-y-0 border-l-0',
              className,
            )}
          >
            {children}
            {hideClose ? null : (
              <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={close} className="absolute top-3 right-3">
                <X aria-hidden />
              </Button>
            )}
          </div>
        </DialogContext.Provider>
      ) : null}
    </dialog>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5 pr-12', className)} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentProps<'h2'>) {
  const { titleId } = useDialogContext('DialogTitle')
  return <h2 id={titleId} className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
}

export function DialogDescription({ className, ...props }: ComponentProps<'p'>) {
  const { descriptionId } = useDialogContext('DialogDescription')
  return <p id={descriptionId} className={cn('text-sm text-muted', className)} {...props} />
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-end', className)}
      {...props}
    />
  )
}

/** Inside a Dialog: `const close = useDialogClose()`. */
export function useDialogClose(): () => void {
  return useDialogContext('useDialogClose consumer').close
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Extra content between the description and the buttons. */
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** "danger" styles the confirm button as destructive. */
  tone?: 'default' | 'danger'
  /** Shows a spinner on the confirm button and blocks closing. */
  loading?: boolean
  onConfirm: () => void
}

/** Two-button confirmation ("Reset demo data?", "Cancel this follow-up?"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmVariant: ButtonVariant = tone === 'danger' ? 'destructive' : 'primary'
  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)} size="sm" hideClose dismissible={!loading}>
      <DialogHeader className="pr-5">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      {children ? <DialogBody className="pb-0">{children}</DialogBody> : null}
      <DialogFooter className="mt-4">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} autoFocus>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
