import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useFloatingLayer, type Align, type Side } from './floating'

export interface TooltipProps {
  /** Short supplementary text. Never put essential information or interactive content here. */
  content: ReactNode
  /** One focusable element (usually a Button). It gets aria-describedby pointing at the tooltip. */
  children: ReactElement<Record<string, unknown>>
  side?: Side
  align?: Align
  /** Hover delay in ms before showing. Focus shows immediately. */
  delay?: number
  /** Render the child without a tooltip. */
  disabled?: boolean
}

/**
 * Hover/focus hint. Shows after `delay` on hover, immediately on keyboard focus,
 * hides on leave, blur, click or Escape.
 *
 * <Tooltip content="Advance the demo clock"><Button size="icon" aria-label="Advance">...</Button></Tooltip>
 */
export function Tooltip({ content, children, side = 'top', align = 'center', delay = 400, disabled }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLSpanElement | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()

  useFloatingLayer(open, anchorRef, tipRef, { side, align, sideOffset: 6 })

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (disabled || !isValidElement(children)) return children

  const show = (wait: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), wait)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }

  const describedBy = [children.props['aria-describedby'] as string | undefined, id].filter(Boolean).join(' ')

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') show(delay)
        }}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocus={(e) => {
          if ((e.target as HTMLElement).matches(':focus-visible')) show(0)
        }}
        onBlur={hide}
      >
        {cloneElement(children, { 'aria-describedby': describedBy })}
      </span>
      <span
        ref={tipRef}
        id={id}
        role="tooltip"
        popover="manual"
        className={cn(
          'pointer-events-none z-50 max-w-64 rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground',
          open && 'animate-fade-in',
        )}
      >
        {content}
      </span>
    </>
  )
}
