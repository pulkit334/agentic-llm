import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { raiseLayer, showLayer } from './floating'

export type ToastTone = 'default' | 'success' | 'error'

export interface ToastOptions {
  title: ReactNode
  description?: ReactNode
  tone?: ToastTone
  /** Optional single action, e.g. { label: 'View', onClick: () => navigate(...) }. */
  action?: { label: string; onClick: () => void }
  /** ms before it disappears; default 5000 (errors 8000). Infinity keeps it until closed. */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

/* ------------------------------------------------------------------ store (usable outside React) */

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const MAX_VISIBLE = 4

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

function push(options: ToastOptions): number {
  const id = nextId++
  items = [...items, { ...options, id }].slice(-MAX_VISIBLE)
  emit()
  return id
}

/**
 * Show a toast from anywhere (components, mutation callbacks, plain functions).
 *
 * toast({ title: 'Follow-up cancelled' })
 * toast.success('Follow-up scheduled', 'Goes out Thu 01 Oct, 11:00')
 * toast.error('Could not cancel', errorMessage(err))
 */
export const toast = Object.assign(push, {
  success: (title: ReactNode, description?: ReactNode) => push({ title, description, tone: 'success' }),
  error: (title: ReactNode, description?: ReactNode) => push({ title, description, tone: 'error' }),
  dismiss,
})

/* ------------------------------------------------------------------ view */

const icons: Record<ToastTone, ReactNode> = {
  default: <Info aria-hidden className="size-4 text-muted" />,
  success: <CircleCheck aria-hidden className="size-4 text-success" />,
  error: <CircleAlert aria-hidden className="size-4 text-danger" />,
}

function ToastCard({ item }: { item: ToastItem }) {
  const timer = useRef<number | undefined>(undefined)
  const remaining = useRef(item.duration ?? (item.tone === 'error' ? 8000 : 5000))
  const started = useRef(0)

  const start = useCallback(() => {
    if (!Number.isFinite(remaining.current)) return
    started.current = Date.now()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => dismiss(item.id), remaining.current)
  }, [item.id])

  const pause = useCallback(() => {
    if (!Number.isFinite(remaining.current)) return
    window.clearTimeout(timer.current)
    remaining.current -= Date.now() - started.current
  }, [])

  useEffect(() => {
    start()
    return () => window.clearTimeout(timer.current)
  }, [start])

  const tone = item.tone ?? 'default'
  return (
    <li
      role={tone === 'error' ? 'alert' : undefined}
      onPointerEnter={pause}
      onPointerLeave={start}
      onFocus={pause}
      onBlur={start}
      className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-lg border border-border-strong bg-surface p-3 pr-2 shadow-popover"
    >
      <span className="mt-0.5">{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{item.title}</p>
        {item.description ? <p className="mt-0.5 text-sm break-words text-muted">{item.description}</p> : null}
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick()
              dismiss(item.id)
            }}
            className="mt-2 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(item.id)}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </li>
  )
}

/**
 * Renders toasts. Mount once at the app root (App.tsx does). Lives in the top layer so it shows
 * above open dialogs too.
 */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => items)
  const ref = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (ref.current) showLayer(ref.current)
  }, [])

  // Each new toast re-raises the region above anything opened since (e.g. a modal dialog).
  useLayoutEffect(() => {
    if (ref.current && list.length) raiseLayer(ref.current)
  }, [list.length])

  return (
    <section
      ref={ref}
      popover="manual"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-auto right-0 bottom-0 z-[60] m-0 w-full max-w-[400px] overflow-visible border-0 bg-transparent p-4"
    >
      <ol aria-live="polite" aria-relevant="additions text" className="flex flex-col gap-2">
        {list.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </ol>
    </section>
  )
}
