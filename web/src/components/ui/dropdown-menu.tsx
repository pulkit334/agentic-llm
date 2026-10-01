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
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDismiss, useFloatingLayer, type Align, type DismissReason, type Side } from './floating'

interface MenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  /** Open (or toggle) the menu, focusing its first or last item. */
  openAt: (target: 'first' | 'last', toggle?: boolean) => void
  /** Which item to focus when the menu opens. */
  focusOnOpen: RefObject<'first' | 'last'>
  triggerRef: RefObject<HTMLButtonElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  menuId: string
  triggerId: string
}

const MenuContext = createContext<MenuContextValue | null>(null)

function useMenuContext(component: string) {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <DropdownMenu>`)
  return ctx
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])'

function items(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : []
}

export interface DropdownMenuProps {
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Menu of actions anchored to a trigger (WAI-ARIA menu button pattern).
 *
 * <DropdownMenu>
 *   <DropdownMenuTrigger aria-label="Account" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>...</DropdownMenuTrigger>
 *   <DropdownMenuContent align="end">
 *     <DropdownMenuLabel>Signed in as ...</DropdownMenuLabel>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem icon={<LogOut />} onSelect={signOut}>Sign out</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 *
 * Keyboard: Enter/Space/ArrowDown open on the first item, ArrowUp on the last; arrows, Home and
 * End move; Escape closes and returns focus; Tab closes and moves on.
 */
export function DropdownMenu({ children, open: openProp, onOpenChange }: DropdownMenuProps) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const open = openProp ?? uncontrolled
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const focusOnOpen = useRef<'first' | 'last'>('first')
  const menuId = useId()
  const triggerId = useId()

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )

  const openAt = useCallback(
    (target: 'first' | 'last', toggle = false) => {
      focusOnOpen.current = target
      setOpen(toggle ? !open : true)
    },
    [open, setOpen],
  )

  const value = useMemo(
    () => ({ open, setOpen, openAt, focusOnOpen, triggerRef, contentRef, menuId, triggerId }),
    [open, setOpen, openAt, menuId, triggerId],
  )
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

/** Unstyled trigger button; style it with `buttonVariants(...)` or your own classes. */
export function DropdownMenuTrigger({ className, onClick, onKeyDown, children, ...props }: ComponentProps<'button'>) {
  const { open, openAt, triggerRef, menuId, triggerId } = useMenuContext('DropdownMenuTrigger')
  return (
    <button
      ref={triggerRef}
      id={triggerId}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      className={className}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        openAt('first', true)
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          openAt(e.key === 'ArrowUp' ? 'last' : 'first')
        }
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export interface DropdownMenuContentProps extends Omit<ComponentProps<'div'>, 'popover'> {
  side?: Side
  align?: Align
  sideOffset?: number
}

export function DropdownMenuContent({ side = 'bottom', align = 'end', sideOffset = 6, className, children, onKeyDown, ...props }: DropdownMenuContentProps) {
  const { open, setOpen, focusOnOpen, triggerRef, contentRef, menuId, triggerId } = useMenuContext('DropdownMenuContent')

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

  useEffect(() => {
    if (!open) return
    const list = items(contentRef.current)
    const target = focusOnOpen.current === 'last' ? list[list.length - 1] : list[0]
    ;(target ?? contentRef.current)?.focus({ preventScroll: true })
  }, [open, contentRef, focusOnOpen])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    const list = items(contentRef.current)
    if (!list.length) return
    const index = list.indexOf(document.activeElement as HTMLElement)
    let next: HTMLElement | undefined
    switch (e.key) {
      case 'ArrowDown':
        next = list[(index + 1) % list.length]
        break
      case 'ArrowUp':
        next = list[(index - 1 + list.length) % list.length]
        break
      case 'Home':
        next = list[0]
        break
      case 'End':
        next = list[list.length - 1]
        break
      case 'Tab':
        setOpen(false)
        return
      default: {
        // Typeahead: jump to the next item starting with the typed letter.
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const key = e.key.toLowerCase()
          const ordered = [...list.slice(index + 1), ...list.slice(0, index + 1)]
          next = ordered.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(key))
        }
      }
    }
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  return (
    <div
      ref={contentRef}
      id={menuId}
      popover="manual"
      role="menu"
      aria-labelledby={triggerId}
      aria-orientation="vertical"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn(
        'z-50 min-w-44 max-w-[calc(100vw-16px)] rounded-lg border border-border-strong bg-surface p-1 text-foreground shadow-popover outline-none',
        open && 'animate-pop-in',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const itemClasses =
  'flex w-full select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground outline-none ' +
  'transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus:bg-surface-2 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted'

export interface DropdownMenuItemProps extends Omit<ComponentProps<'button'>, 'onSelect'> {
  /** Runs on click / Enter / Space. Call `event.preventDefault()` to keep the menu open. */
  onSelect?: (event: MouseEvent<HTMLButtonElement>) => void
  icon?: ReactNode
  /** Right-aligned hint (e.g. a <Kbd>). */
  shortcut?: ReactNode
  destructive?: boolean
}

export function DropdownMenuItem({ onSelect, icon, shortcut, destructive, disabled, className, children, ...props }: DropdownMenuItemProps) {
  const { setOpen, triggerRef } = useMenuContext('DropdownMenuItem')
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      className={cn(itemClasses, destructive && 'text-danger [&>svg]:text-danger', className)}
      onClick={(e) => {
        if (disabled) return
        onSelect?.(e)
        if (!e.defaultPrevented) {
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
      {...props}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="ml-auto pl-4 text-xs text-subtle">{shortcut}</span> : null}
    </button>
  )
}

export interface DropdownMenuRadioItemProps extends DropdownMenuItemProps {
  checked: boolean
}

/** A choice in a set (e.g. theme: System / Light / Dark). Shows a check when selected. */
export function DropdownMenuRadioItem({ checked, icon, children, className, ...props }: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuItem
      role="menuitemradio"
      aria-checked={checked}
      icon={icon}
      shortcut={checked ? <Check aria-hidden className="size-4 text-foreground" /> : null}
      className={className}
      {...props}
    >
      {children}
    </DropdownMenuItem>
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-2 py-1.5 text-xs text-muted', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<'div'>) {
  return <div role="separator" className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
