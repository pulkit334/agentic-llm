import type { AgentEvent } from '@/lib/api'
import { AGENT_STEP_LABELS, TOOL_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatData, toolName } from './steps'

function isToolError(event: AgentEvent): boolean {
  return event.type === 'tool_result' && Boolean(event.data && (event.data as { is_error?: unknown }).is_error)
}

export interface RunTraceProps {
  events: AgentEvent[]
  className?: string
}

/**
 * Every event of the run as the agent produced it: its plan and reasoning, each tool call with its
 * input and each result, in order. Tool data is collapsed by default.
 */
export function RunTrace({ events, className }: RunTraceProps) {
  if (!events.length) {
    return (
      <p className={cn('rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted', className)}>
        Events appear here as the assistant works.
      </p>
    )
  }

  return (
    <ol
      aria-label="Technical trace"
      className={cn(
        'scrollbar-thin max-h-[560px] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background font-mono text-xs leading-5',
        className,
      )}
    >
      {events.map((event, index) => {
        const tool = toolName(event)
        const failed = event.type === 'error' || isToolError(event)
        const hasData = event.data !== null && typeof event.data === 'object' && Object.keys(event.data).length > 0
        return (
          <li key={index} className="flex gap-3 px-3 py-2">
            <span aria-hidden className="w-5 shrink-0 text-right text-subtle tabular-nums select-none">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn('font-medium', failed ? 'text-danger' : event.type === 'tool_call' ? 'text-foreground' : 'text-muted')}>
                  {event.type}
                </span>
                {tool ? <span className="text-subtle">{TOOL_LABELS[tool] ?? tool}</span> : null}
                {event.step ? <span className="ml-auto text-subtle">{AGENT_STEP_LABELS[event.step]}</span> : null}
              </div>
              <p className={cn('mt-0.5 break-words whitespace-pre-wrap', event.type === 'thinking' ? 'text-subtle italic' : failed ? 'text-danger' : 'text-muted')}>
                {event.text}
              </p>
              {hasData ? (
                <details className="group mt-1">
                  <summary className="w-fit cursor-pointer rounded-sm text-subtle select-none hover:text-foreground">
                    <span className="group-open:hidden">Show data</span>
                    <span className="hidden group-open:inline">Hide data</span>
                  </summary>
                  <pre className="scrollbar-thin mt-1.5 max-h-72 overflow-auto rounded-sm border border-border bg-surface p-2 break-words whitespace-pre-wrap text-muted">
                    {formatData(event.data)}
                  </pre>
                </details>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
