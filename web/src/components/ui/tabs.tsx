import { createContext, useCallback, useContext, useId, useMemo, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
  baseId: string
  variant: 'underline' | 'pills'
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(component: string) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Tabs>`)
  return ctx
}

const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-')

export interface TabsProps extends Omit<ComponentProps<'div'>, 'defaultValue' | 'onChange'> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** underline (default, for page sections) or pills (compact segmented look). */
  variant?: 'underline' | 'pills'
  children: ReactNode
}

/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation). Arrow keys, Home and End move between tabs.
 *
 * <Tabs value={status} onValueChange={setStatus}>
 *   <TabsList aria-label="Follow-up status">
 *     <TabsTrigger value="pending">Pending <Badge size="sm" mono>3</Badge></TabsTrigger>
 *     <TabsTrigger value="sent">Sent</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="pending">...</TabsContent>
 * </Tabs>
 */
export function Tabs({ value: valueProp, defaultValue = '', onValueChange, variant = 'underline', className, children, ...props }: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const value = valueProp ?? uncontrolled
  const baseId = useId()
  const setValue = useCallback(
    (next: string) => {
      if (valueProp === undefined) setUncontrolled(next)
      onValueChange?.(next)
    },
    [valueProp, onValueChange],
  )
  const ctx = useMemo(() => ({ value, setValue, baseId, variant }), [value, setValue, baseId, variant])
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('flex flex-col', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, onKeyDown, ...props }: ComponentProps<'div'>) {
  const { variant } = useTabsContext('TabsList')
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (index === -1) return
    let next: HTMLButtonElement | undefined
    if (e.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length]
    else if (e.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length]
    else if (e.key === 'Home') next = tabs[0]
    else if (e.key === 'End') next = tabs[tabs.length - 1]
    if (next) {
      e.preventDefault()
      next.focus()
      next.click()
    }
  }
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(
        'scrollbar-thin flex max-w-full items-center overflow-x-auto',
        variant === 'underline' ? 'gap-4 border-b border-border' : 'w-fit gap-1 rounded-md border border-border bg-surface p-0.5',
        className,
      )}
      {...props}
    />
  )
}

export interface TabsTriggerProps extends Omit<ComponentProps<'button'>, 'value'> {
  value: string
}

export function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const { value: selected, setValue, baseId, variant } = useTabsContext('TabsTrigger')
  const active = selected === value
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${safe(value)}`}
      aria-selected={active}
      aria-controls={`${baseId}-panel-${safe(value)}`}
      tabIndex={active ? 0 : -1}
      data-state={active ? 'active' : 'inactive'}
      onClick={() => setValue(value)}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
        variant === 'underline'
          ? cn(
              '-mb-px h-10 border-b-2 px-0.5 focus-visible:outline-offset-[-2px]',
              active ? 'border-foreground text-foreground' : 'border-transparent text-muted hover:text-foreground',
            )
          : cn('h-7 rounded-sm px-2.5', active ? 'bg-surface-3 text-foreground' : 'text-muted hover:text-foreground'),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export interface TabsContentProps extends ComponentProps<'div'> {
  value: string
  /** Keep the panel mounted while hidden (preserves state). Default false. */
  keepMounted?: boolean
}

export function TabsContent({ value, keepMounted = false, className, children, ...props }: TabsContentProps) {
  const { value: selected, baseId } = useTabsContext('TabsContent')
  const active = selected === value
  if (!active && !keepMounted) return null
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${safe(value)}`}
      aria-labelledby={`${baseId}-tab-${safe(value)}`}
      hidden={!active}
      tabIndex={0}
      className={cn('pt-4 focus-visible:outline-offset-4', className)}
      {...props}
    >
      {children}
    </div>
  )
}
