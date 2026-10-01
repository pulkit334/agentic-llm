/**
 * Static copy and small helpers for the public landing page.
 * Product facts (strategies, safeguards, tools) come from `@/lib/product`, which mirrors the backend.
 */
import { useLayoutEffect } from 'react'
import { useAuth } from '@/lib/auth'

export { focusSection } from '@/components/focus-section'

/** In-page sections reachable from the header navigation. */
export const SECTIONS = {
  howItWorks: { id: 'how-it-works', label: 'How it works' },
  safeguards: { id: 'safeguards', label: 'Safeguards' },
  strategies: { id: 'strategies', label: 'Strategies' },
  underTheHood: { id: 'under-the-hood', label: 'Under the hood' },
} as const

export const NAV_SECTIONS = [SECTIONS.howItWorks, SECTIONS.safeguards, SECTIONS.strategies]

/** "warm, helpful, low-pressure" -> "Warm, helpful, low-pressure". */
export function sentenceCase(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/**
 * Smooth in-page scrolling while the landing page is mounted. A layout effect, so the
 * cleanup runs before the next page's scroll reset (which should stay instant).
 * The global reduced-motion rule in index.css overrides this with `auto !important`.
 */
export function useSmoothScroll() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    root.style.scrollBehavior = 'smooth'
    return () => {
      root.style.scrollBehavior = previous
    }
  }, [])
}

export interface LandingCta {
  signedIn: boolean
  primary: { to: string; label: string }
  secondary: { to: string; label: string }
}

/** Calls to action that adapt to whether the visitor is already signed in. */
export function useLandingCta(): LandingCta {
  const { status } = useAuth()
  if (status === 'authenticated') {
    return {
      signedIn: true,
      primary: { to: '/app', label: 'Open the app' },
      secondary: { to: '/app/new', label: 'New follow-up' },
    }
  }
  return {
    signedIn: false,
    primary: { to: '/signup', label: 'Get started' },
    secondary: { to: '/signin', label: 'Sign in' },
  }
}
