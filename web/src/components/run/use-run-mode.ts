import { useState } from 'react'
import type { RunMode } from '@/lib/api'
import { useOverview } from '@/lib/queries'

/**
 * The selected run mode. Until the person picks one, it follows the server: Smart AI when Claude
 * is reachable, the built-in rules when it is not.
 */
export function useRunMode(): { mode: RunMode; setMode: (mode: RunMode) => void; llmAvailable: boolean | null } {
  const { data: overview } = useOverview()
  const [chosen, setMode] = useState<RunMode | null>(null)
  const llmAvailable = overview ? overview.llm_available : null
  const mode: RunMode = chosen ?? (llmAvailable === false ? 'rules' : 'llm')
  return { mode, setMode, llmAvailable }
}
