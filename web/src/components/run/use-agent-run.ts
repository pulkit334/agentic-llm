import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { runAgent, type AgentEvent, type RunAgentBody, type RunMode, type RunResult } from '@/lib/api'
import { invalidateWorkflow } from '@/lib/query'
import type { RunPhase } from './steps'

export interface AgentRunState {
  phase: RunPhase
  /** Every streamed event, in order. */
  events: AgentEvent[]
  result: RunResult | null
  /** What stopped the run (HTTP error such as 409 busy, lost connection). */
  error: unknown
  /** The mode that was requested for the current run. */
  mode: RunMode | null
}

export interface AgentRun extends AgentRunState {
  running: boolean
  /** Start a run. Resolves with the result, or null when the run failed (see `error`). */
  start: (body: RunAgentBody) => Promise<RunResult | null>
  /** Forget the current run (the server finishes it regardless). */
  reset: () => void
}

const INITIAL: AgentRunState = { phase: 'idle', events: [], result: null, error: null, mode: null }

/**
 * One live agent run streamed from POST /api/agent/run.
 *
 * Leaving the page does not stop the run on the server, so the stream is left to finish in the
 * background; when it ends, every list that the run may have changed is refreshed.
 */
export function useAgentRun(): AgentRun {
  const client = useQueryClient()
  const [state, setState] = useState<AgentRunState>(INITIAL)
  // Each run gets a token; callbacks from a run that was reset or replaced are ignored.
  const token = useRef(0)

  const start = useCallback(
    async (body: RunAgentBody) => {
      const mine = ++token.current
      const current = () => token.current === mine
      setState({ ...INITIAL, phase: 'running', mode: body.mode })
      try {
        const result = await runAgent(body, (event) => {
          if (current()) setState((s) => ({ ...s, events: [...s.events, event] }))
        })
        if (current()) setState((s) => ({ ...s, phase: 'done', result }))
        return result
      } catch (error) {
        if (current()) setState((s) => ({ ...s, phase: 'failed', error }))
        return null
      } finally {
        // Even a failed run may have saved a conversation or scheduled something before it stopped.
        void invalidateWorkflow(client)
      }
    },
    [client],
  )

  const reset = useCallback(() => {
    token.current++
    setState(INITIAL)
  }, [])

  return { ...state, running: state.phase === 'running', start, reset }
}
