/**
 * Internal helpers for floating layers (Popover, DropdownMenu, Tooltip).
 *
 * Floating content is a `popover="manual"` element: it renders in the browser's top layer (above
 * sticky headers and modal dialogs, never clipped by overflow), but stays right after its trigger
 * in the DOM so keyboard Tab order is natural. We position it ourselves and handle dismissal.
 */
import { useCallback, useEffect, useLayoutEffect, type RefObject } from 'react'

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'

const VIEWPORT_PADDING = 8

function supportsPopover(el: HTMLElement): boolean {
  return typeof el.showPopover === 'function'
}

export function showLayer(el: HTMLElement) {
  if (!supportsPopover(el)) {
    el.hidden = false
    el.style.position = 'fixed'
    el.style.zIndex = '60'
    return
  }
  if (!el.matches(':popover-open')) el.showPopover()
}

export function hideLayer(el: HTMLElement) {
  if (!supportsPopover(el)) {
    el.hidden = true
    return
  }
  if (el.matches(':popover-open')) el.hidePopover()
}

/** Bring an already-open layer to the top of the top layer (e.g. above a dialog opened later). */
export function raiseLayer(el: HTMLElement) {
  if (!supportsPopover(el) || !el.matches(':popover-open')) return
  el.hidePopover()
  el.showPopover()
}

export interface PlaceOptions {
  side?: Side
  align?: Align
  /** Gap between anchor and content in px. */
  sideOffset?: number
  /** Make the content at least as wide as the anchor. */
  matchWidth?: boolean
}

/** Position `floating` next to `anchor`, flipping to the other side and clamping to the viewport. */
export function place(anchor: HTMLElement, floating: HTMLElement, { side = 'bottom', align = 'start', sideOffset = 6, matchWidth = false }: PlaceOptions) {
  if (matchWidth) floating.style.minWidth = `${anchor.getBoundingClientRect().width}px`
  const a = anchor.getBoundingClientRect()
  const w = floating.offsetWidth
  const h = floating.offsetHeight
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const P = VIEWPORT_PADDING

  let resolved: Side = side
  if (side === 'bottom' && a.bottom + sideOffset + h > vh - P && a.top - sideOffset - h >= P) resolved = 'top'
  else if (side === 'top' && a.top - sideOffset - h < P && a.bottom + sideOffset + h <= vh - P) resolved = 'bottom'
  else if (side === 'right' && a.right + sideOffset + w > vw - P && a.left - sideOffset - w >= P) resolved = 'left'
  else if (side === 'left' && a.left - sideOffset - w < P && a.right + sideOffset + w <= vw - P) resolved = 'right'

  let top: number
  let left: number
  if (resolved === 'top' || resolved === 'bottom') {
    top = resolved === 'bottom' ? a.bottom + sideOffset : a.top - sideOffset - h
    left = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2
  } else {
    left = resolved === 'right' ? a.right + sideOffset : a.left - sideOffset - w
    top = align === 'start' ? a.top : align === 'end' ? a.bottom - h : a.top + a.height / 2 - h / 2
  }

  left = Math.min(Math.max(left, P), Math.max(vw - w - P, P))
  top = Math.min(Math.max(top, P), Math.max(vh - h - P, P))

  floating.style.top = `${Math.round(top)}px`
  floating.style.left = `${Math.round(left)}px`
  floating.dataset.side = resolved
}

/**
 * Show/hide the floating element with `open` and keep it positioned while open
 * (on resize, on any scroll, and when its own size changes).
 */
export function useFloatingLayer(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  options: PlaceOptions,
) {
  const { side, align, sideOffset, matchWidth } = options

  const update = useCallback(() => {
    const anchor = anchorRef.current
    const floating = floatingRef.current
    if (anchor && floating) place(anchor, floating, { side, align, sideOffset, matchWidth })
  }, [anchorRef, floatingRef, side, align, sideOffset, matchWidth])

  // Layout effect: show + position before the browser paints, so there is no jump.
  useLayoutEffect(() => {
    const floating = floatingRef.current
    if (!floating) return
    if (open) {
      showLayer(floating)
      update()
    } else {
      hideLayer(floating)
    }
  }, [open, update, floatingRef])

  useEffect(() => {
    if (!open) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    if (observer && floatingRef.current) observer.observe(floatingRef.current)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      observer?.disconnect()
    }
  }, [open, update, floatingRef])

  // Hide on unmount so a top-layer element never lingers.
  useEffect(() => {
    const floating = floatingRef.current
    return () => {
      if (floating) hideLayer(floating)
    }
  }, [floatingRef])

  return update
}

export type DismissReason = 'outside' | 'escape' | 'focus-out'

/**
 * Close on pointer-down outside, Escape, or focus moving outside the trigger + content.
 * Escape is handled in the capture phase and stops there, so an enclosing Dialog stays open.
 */
export function useDismiss(
  open: boolean,
  refs: RefObject<HTMLElement | null>[],
  onDismiss: (reason: DismissReason) => void,
  { focusOut = true }: { focusOut?: boolean } = {},
) {
  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) => target instanceof Node && refs.some((r) => r.current?.contains(target))

    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) onDismiss('outside')
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onDismiss('escape')
      }
    }
    const onFocusIn = (e: FocusEvent) => {
      if (focusOut && !inside(e.target)) onDismiss('focus-out')
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open, refs, onDismiss, focusOut])
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function firstFocusable(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(FOCUSABLE)
}
