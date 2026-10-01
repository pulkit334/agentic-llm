import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query'
import { ApiError, isUnauthorized, type ActivityParams, type FollowUpStatus, type User } from './api'

/**
 * Query keys. Always build keys from here so invalidation stays consistent.
 * Prefix keys (e.g. `queryKeys.followupsAll`) invalidate every variant below them.
 */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  authStatus: ['auth', 'status'] as const,
  overview: ['overview'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
  followupsAll: ['followups'] as const,
  followups: (status?: FollowUpStatus) => ['followups', status ?? 'all'] as const,
  sent: ['sent'] as const,
  activityAll: ['activity'] as const,
  activity: (params: ActivityParams = {}) => ['activity', params.thread_id ?? 'all', params.limit ?? 100] as const,
  strategies: ['strategies'] as const,
  clock: ['clock'] as const,
  sample: ['samples', 'new-conversation'] as const,
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    // Any 401 from a data query means the session ended: drop the user so RequireAuth
    // sends them to /signin.
    onError: (error, query) => {
      if (isUnauthorized(error) && query.queryKey[0] !== 'auth') {
        queryClient.setQueryData<User | null>(queryKeys.me, null)
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isUnauthorized(error)) queryClient.setQueryData<User | null>(queryKeys.me, null)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Client errors (4xx) are final; network and server errors get two more tries.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
    mutations: {
      retry: false,
    },
  },
})

/**
 * Refresh everything that an agent run, a reply, a send or a clock change can affect:
 * overview, conversations (list + detail), follow-ups, sent, activity and the clock.
 * Call it after any mutation that changes workflow data.
 */
export function invalidateWorkflow(client: QueryClient = queryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.overview }),
    client.invalidateQueries({ queryKey: queryKeys.conversations }),
    client.invalidateQueries({ queryKey: queryKeys.followupsAll }),
    client.invalidateQueries({ queryKey: queryKeys.sent }),
    client.invalidateQueries({ queryKey: queryKeys.activityAll }),
    client.invalidateQueries({ queryKey: queryKeys.clock }),
  ]).then(() => undefined)
}
