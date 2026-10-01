import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import * as api from './api'
import type { User } from './api'
import { queryKeys } from './query'
import { FullPageSpinner } from '@/components/ui/spinner'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  user: User | null
  status: AuthStatus
  isAdmin: boolean
  /** Throws ApiError with a human message on failure. */
  signIn: (email: string, password: string) => Promise<User>
  /** Throws ApiError with a human message on failure. The first account becomes admin. */
  signUp: (name: string, email: string, password: string) => Promise<User>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** GET /api/auth/me, with "not signed in" (401) as `null` rather than an error. */
async function fetchMe(signal?: AbortSignal): Promise<User | null> {
  try {
    return (await api.getMe(signal)).user
  } catch (error) {
    if (api.isUnauthorized(error)) return null
    throw error
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const user = me.data ?? null
  // If /auth/me itself fails (server down), treat the visitor as signed out; the sign-in
  // page then shows the real error when they try.
  const status: AuthStatus = me.isPending ? 'loading' : user ? 'authenticated' : 'anonymous'

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { user: signedIn } = await api.login({ email, password })
      client.setQueryData(queryKeys.me, signedIn)
      return signedIn
    },
    [client],
  )

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const { user: created } = await api.register({ name, email, password })
      client.setQueryData(queryKeys.me, created)
      client.setQueryData(queryKeys.authStatus, { has_users: true })
      return created
    },
    [client],
  )

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      // Drop every cached response that belonged to the session, then mark signed out.
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' })
      client.setQueryData(queryKeys.me, null)
    }
  }, [client])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, isAdmin: user?.role === 'admin', signIn, signUp, signOut }),
    [user, status, signIn, signUp, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Location state set by RequireAuth so sign-in can return people where they were going. */
export interface AuthRedirectState {
  from?: string
}

/** Route guard for /app/*: waits for the session check, then renders the outlet or redirects to /signin. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner label="Checking your session" />
  if (status === 'anonymous') {
    const state: AuthRedirectState = { from: `${location.pathname}${location.search}` }
    return <Navigate to="/signin" replace state={state} />
  }
  return <Outlet />
}

/** Route guard for /signin and /signup: signed-in people go straight to the app. */
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner label="Checking your session" />
  if (status === 'authenticated') {
    const from = (location.state as AuthRedirectState | null)?.from
    return <Navigate to={from && from.startsWith('/app') ? from : '/app'} replace />
  }
  return <Outlet />
}
