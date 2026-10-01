import type { ComponentType } from 'react'
import { Outlet, ScrollRestoration, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import type { RouteHandle } from '@/components/layout/page-title'
import { FullPageSpinner } from '@/components/ui/spinner'
import { GuestOnly, RequireAuth } from '@/lib/auth'
import RouteError from '@/pages/RouteError'

/** Code-split page: `lazy: page(() => import('./pages/X'))` (the module's default export is the page). */
function page(load: () => Promise<{ default: ComponentType }>) {
  return async () => ({ Component: (await load()).default })
}

function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

const handle = (title: string): RouteHandle => ({ title })

/**
 * All routes.
 *   /                         Landing (public)
 *   /signin, /signup          auth pages (signed-in visitors are sent to /app)
 *   /app/...                  the app (requires sign-in), inside AppLayout
 *   *                         404
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    HydrateFallback: () => <FullPageSpinner />,
    children: [
      { path: '/', lazy: page(() => import('@/pages/Landing')) },
      {
        element: <GuestOnly />,
        children: [
          { path: '/signin', lazy: page(() => import('@/pages/SignIn')) },
          { path: '/signup', lazy: page(() => import('@/pages/SignUp')) },
        ],
      },
      {
        path: '/app',
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                // Page errors render inside the layout so navigation keeps working.
                errorElement: <RouteError embedded />,
                children: [
                  { index: true, handle: handle('Overview'), lazy: page(() => import('@/pages/app/Overview')) },
                  { path: 'conversations', handle: handle('Conversations'), lazy: page(() => import('@/pages/app/Conversations')) },
                  { path: 'conversations/:id', handle: handle('Conversation'), lazy: page(() => import('@/pages/app/ConversationDetail')) },
                  { path: 'new', handle: handle('New follow-up'), lazy: page(() => import('@/pages/app/NewFollowUp')) },
                  { path: 'scheduled', handle: handle('Scheduled'), lazy: page(() => import('@/pages/app/Scheduled')) },
                  { path: 'sent', handle: handle('Sent'), lazy: page(() => import('@/pages/app/Sent')) },
                  { path: 'activity', handle: handle('Activity'), lazy: page(() => import('@/pages/app/Activity')) },
                  { path: 'how-it-works', handle: handle('How it works'), lazy: page(() => import('@/pages/app/HowItWorks')) },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', lazy: page(() => import('@/pages/NotFound')) },
    ],
  },
])
