import { Info, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOverview } from '@/lib/queries'

const STORAGE_KEY = 'fu-offline-banner-dismissed'

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Shown under the top bar while the Claude API is unavailable. Dismissal lasts for the browser session. */
export function OfflineBanner() {
  const { data } = useOverview()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!data || data.llm_available || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // not persisted; hidden until reload
    }
  }

  return (
    <div role="status" className="flex items-start gap-3 border-b border-border bg-surface px-4 py-2.5 text-sm sm:items-center sm:px-6 lg:px-8">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warning sm:mt-0" />
      <p className="min-w-0 flex-1 text-muted">
        <span className="font-medium text-foreground">Smart AI is offline – using built-in rules.</span>{' '}
        Every run still works: Smart AI requests fall back to the rules agent, which uses the same tools and safeguards.
      </p>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss notice" onClick={dismiss} className="-my-1 shrink-0">
        <X aria-hidden />
      </Button>
    </div>
  )
}
