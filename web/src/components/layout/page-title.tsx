import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** `handle` on every app route in src/router.tsx; the top bar shows `title`. */
export interface RouteHandle {
  title: string
}

const APP_NAME = 'Followup'

interface PageTitleContextValue {
  override: string | null
  setOverride: (title: string | null) => void
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null)

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null)
  const value = useMemo(() => ({ override, setOverride }), [override])
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>
}

/** The top-bar title set by the current page, if any (AppLayout reads this). */
export function usePageTitleOverride(): string | null {
  return useContext(PageTitleContext)?.override ?? null
}

/**
 * App pages: replace the top-bar title (and the browser tab title) while mounted, e.g.
 * `usePageTitle(conversation?.contact.name)` on the conversation page. Falsy values are ignored.
 */
export function usePageTitle(title: string | null | undefined) {
  const ctx = useContext(PageTitleContext)
  const setOverride = ctx?.setOverride
  useEffect(() => {
    if (!setOverride || !title) return
    setOverride(title)
    return () => setOverride(null)
  }, [setOverride, title])
}

/** Set the browser tab title: "<title> · Followup" (or just "Followup"). For public pages. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])
}
