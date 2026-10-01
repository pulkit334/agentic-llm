/**
 * Shared react-query hooks. Pages may also call `useQuery` directly with `queryKeys` + the
 * functions in api.ts; these hooks exist so common data is fetched one way everywhere.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import * as api from './api'
import type { ActivityParams, FollowUpStatus } from './api'
import { parseDate } from './format'
import { invalidateWorkflow, queryKeys } from './query'

/* ------------------------------------------------------------------ reads */

/** GET /api/auth/status: whether any account exists yet (sign-up shows "create the first account" when not). */
export function useAuthStatus() {
  return useQuery({
    queryKey: queryKeys.authStatus,
    queryFn: ({ signal }) => api.getAuthStatus(signal),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useOverview() {
  return useQuery({ queryKey: queryKeys.overview, queryFn: ({ signal }) => api.getOverview(signal) })
}

export function useConversations() {
  return useQuery({ queryKey: queryKeys.conversations, queryFn: ({ signal }) => api.listConversations(signal) })
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversation(id ?? ''),
    queryFn: ({ signal }) => api.getConversation(id as string, signal),
    enabled: Boolean(id),
  })
}

export function useFollowups(status?: FollowUpStatus) {
  return useQuery({ queryKey: queryKeys.followups(status), queryFn: ({ signal }) => api.listFollowups(status, signal) })
}

export function useSent() {
  return useQuery({ queryKey: queryKeys.sent, queryFn: ({ signal }) => api.listSent(signal) })
}

export function useActivity(params: ActivityParams = {}) {
  return useQuery({ queryKey: queryKeys.activity(params), queryFn: ({ signal }) => api.listActivity(params, signal) })
}

export function useStrategies() {
  return useQuery({ queryKey: queryKeys.strategies, queryFn: ({ signal }) => api.getStrategies(signal), staleTime: Infinity })
}

export function useSampleConversation(enabled = true) {
  return useQuery({ queryKey: queryKeys.sample, queryFn: ({ signal }) => api.getSampleConversation(signal), staleTime: Infinity, enabled })
}

/** The simulated demo clock. It only moves when someone advances it. */
export function useClock() {
  return useQuery({ queryKey: queryKeys.clock, queryFn: ({ signal }) => api.getClock(signal), staleTime: 30_000 })
}

/**
 * The simulated "now" as a Date, for relative times and countdowns.
 * Falls back to the real time until the clock has loaded.
 */
export function useNow(): Date {
  const { data } = useClock()
  const [fallback] = useState(() => new Date())
  return useMemo(() => (data ? parseDate(data.utc) : fallback), [data, fallback])
}

/* ------------------------------------------------------------------ writes (each refreshes the affected data) */

export function useUpdateFollowup() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: number; subject?: string; body?: string; send_at?: string }) =>
      api.updateFollowup(vars.id, { subject: vars.subject, body: vars.body, send_at: vars.send_at }),
    onSuccess: () => invalidateWorkflow(client),
  })
}

export function useSendFollowupNow() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.sendFollowupNow(id),
    onSuccess: () => invalidateWorkflow(client),
  })
}

export function useCancelFollowup() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: number; reason?: string }) => api.cancelFollowup(vars.id, vars.reason),
    onSuccess: () => invalidateWorkflow(client),
  })
}

export function useSimulateReply() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { threadId: string; body: string }) => api.simulateReply(vars.threadId, vars.body),
    onSuccess: () => invalidateWorkflow(client),
  })
}

export function useAdvanceClock() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (hours: number) => api.advanceClock(hours),
    onSuccess: (res) => {
      client.setQueryData(queryKeys.clock, res.clock)
      return invalidateWorkflow(client)
    },
  })
}

export function useRunDue() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.runDue(),
    onSuccess: () => invalidateWorkflow(client),
  })
}

export function useResetDemo() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.resetDemo(),
    // Everything except the session and static data changes; refetch it all.
    onSuccess: () => invalidateWorkflow(client),
  })
}
