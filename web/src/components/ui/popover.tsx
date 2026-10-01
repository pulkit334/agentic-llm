import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '@/lib/utils'
import { firstFocusable, useDismiss, useFloatingLayer, type Align, type DismissReason, type Side } from './floating'

interface PopoverContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: RefObject<HTMLButtonElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  contentId: string
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

function usePopoverContext(component: string) {
  const ctx = useContext(PopoverContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Popover>`)
  return ctx
}

export interface PopoverProps {
  children: ReactNode
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
}

/**
 * Non-modal floating panel anchored to a trigger.
 *
 * <Popover>
 *   <PopoverTrigger className={buttonVariants({ variant: 'ghost' })}>Open</PopoverTrigger>
 *   <PopoverContent align="end" aria-label="Demo clock">...</PopoverContent>
 * </Popover>
 *
 * Closes on outside click, Escape (focus returns to the trigger) and focus leaving it.
 * Inside the content, `usePopover().close()` closes it programmatically.
 */
export function Popover({ children, open: openProp, onOpenChange, defaultOpen = false }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const contentId = useId()

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )

  const value = useMemo(() => ({ open, setOpen, triggerRef, contentRef, contentId }), [open, setOpen, contentId])
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
}

/** The button that toggles the popover. Unstyled: pass `className={buttonVariants(...)}` or your own classes. */
export function PopoverTrigger({ className, onClick, children, ...props }: ComponentProps<'button'>) {
  const { open, setOpen, triggerRef, contentId } = usePopoverContext('PopoverTrigger')
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={contentId}
      className={className}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) setOpen(!open)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export interface PopoverContentProps extends Omit<ComponentProps<'div'>, 'popover'> {
  side?: Side
  align?: Align
  sideOffset?: number
  /** Where focus goes on open: the first focusable element (default), the panel itself, or nowhere. */
  initialFocus?: 'first' | 'content' | 'none'
}

export function PopoverContent({
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  initialFocus = 'first',
  className,
  children,
  ...props
}: PopoverContentProps) {
  const { open, setOpen, triggerRef, contentRef, contentId } = usePopoverContext('PopoverContent')

  useFloatingLayer(open, triggerRef, contentRef, { side, align, sideOffset })

  const refs = useMemo(() => [triggerRef, contentRef], [triggerRef, contentRef])
  const onDismiss = useCallback(
    (reason: DismissReason) => {
      setOpen(false)
      if (reason === 'escape') triggerRef.current?.focus()
    },
    [setOpen, triggerRef],
  )
  useDismiss(open, refs, onDismiss)

  // Move focus in once the layer is shown and positioned (useFloatingLayer runs first, as a layout effect).
  useEffect(() => {
    if (!open || initialFocus === 'none') return
    const node = contentRef.current
    if (!node) return
    const target = initialFocus === 'first' ? (firstFocusable(node) ?? node) : node
    target.focus({ preventScroll: true })
  }, [open, initialFocus, contentRef])

  return (
    <div
      ref={contentRef}
      id={contentId}
      popover="manual"
      role="dialog"
      tabIndex={-1}
      className={cn(
        'z-50 max-w-[calc(100vw-16px)] rounded-lg border border-border-strong bg-surface p-3 text-foreground shadow-popover outline-none',
        open && 'animate-pop-in',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Inside PopoverContent: `const { close } = usePopover()`. */
export function usePopover() {
  const { open, setOpen, triggerRef } = usePopoverContext('usePopover consumer')
  return {
    open,
    close: (returnFocus = true) => {
      setOpen(false)
      if (returnFocus) triggerRef.current?.focus()
    },
  }
}
