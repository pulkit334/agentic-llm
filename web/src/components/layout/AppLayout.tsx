import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches, useNavigation } from 'react-router-dom'
import { SkipLink } from '@/components/skip-link'
import { Dialog } from '@/components/ui/dialog'
import { OfflineBanner } from './OfflineBanner'
import { PageTitleProvider, useDocumentTitle, usePageTitleOverride, type RouteHandle } from './page-title'
import { Sidebar, SidebarContent } from './Sidebar'
import { TopBar } from './TopBar'

function useRouteTitle(): string {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i].handle as RouteHandle | undefined
    if (handle?.title) return handle.title
  }
  return 'Followup'
}

function Shell() {
  const routeTitle = useRouteTitle()
  const override = usePageTitleOverride()
  const title = override ?? routeTitle
  useDocumentTitle(title)

  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const navigation = useNavigation()
  const mainRef = useRef<HTMLElement | null>(null)
  const lastPath = useRef(location.pathname)

  // On navigation: close the mobile sheet and move focus to the new page for keyboard and screen-reader users.
  useEffect(() => {
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    setNavOpen(false)
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-background">
      <SkipLink />
      <Sidebar />
      <div className="flex min-h-dvh flex-col md:pl-60">
        <TopBar title={title} onOpenNav={() => setNavOpen(true)} busy={navigation.state === 'loading'} />
        <OfflineBanner />
        <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      <Dialog open={navOpen} onOpenChange={setNavOpen} side="left" className="bg-surface">
        <SidebarContent onNavigate={() => setNavOpen(false)} />
      </Dialog>
    </div>
  )
}

/** Signed-in app frame: sidebar, top bar (title, demo clock, theme, account), offline notice, page outlet. */
export function AppLayout() {
  return (
    <PageTitleProvider>
      <Shell />
    </PageTitleProvider>
  )
}
