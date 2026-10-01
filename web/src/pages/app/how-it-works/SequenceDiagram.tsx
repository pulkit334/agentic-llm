import { ChevronRight } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Sequence diagram of one follow-up, from the request to the email going out:
 * You -> Agent -> Claude -> Tools -> Safeguards -> MySQL -> Email tool.
 *
 * Hand-drawn SVG (no diagram library). Every colour comes from the theme tokens through
 * fill-* / stroke-* utilities, so it follows light and dark mode. The same data renders an
 * ordered list, which is the text alternative and the readable version on small screens.
 */

type ActorId = 'you' | 'agent' | 'claude' | 'tools' | 'guards' | 'db' | 'email'

const ACTORS: { id: ActorId; name: string; sub: string }[] = [
  { id: 'you', name: 'You', sub: 'web app' },
  { id: 'agent', name: 'Agent', sub: 'agent · scheduler' },
  { id: 'claude', name: 'Claude', sub: 'Anthropic API' },
  { id: 'tools', name: 'Tools', sub: 'tools.py' },
  { id: 'guards', name: 'Safeguards', sub: 'guards.py' },
  { id: 'db', name: 'MySQL', sub: 'db.py' },
  { id: 'email', name: 'Email tool', sub: 'mock or SMTP' },
]

const ACTOR_NAME: Record<ActorId, string> = Object.fromEntries(ACTORS.map((a) => [a.id, a.name])) as Record<ActorId, string>

interface Message {
  type: 'message'
  from: ActorId
  to: ActorId
  /** Short arrow label. */
  label: string
  /** The label is code (a function or tool call). */
  code?: boolean
  /** A response (dashed line, open arrowhead). */
  reply?: boolean
  /** Full sentence for the list version. */
  description: string
}

type Row = Message | { type: 'loop-start'; label: string } | { type: 'loop-end' } | { type: 'divider'; label: string }

const ROWS: Row[] = [
  {
    type: 'message',
    from: 'you',
    to: 'agent',
    label: 'conversation or thread',
    description: 'You paste a conversation or open an existing one, choose Smart AI or Rules, and start the run.',
  },
  {
    type: 'message',
    from: 'agent',
    to: 'claude',
    label: 'thread + 11 tools',
    description: 'The agent sends Claude the request, the seven-step workflow and the definitions of its 11 tools.',
  },
  { type: 'loop-start', label: 'until record_decision · at most 15 turns' },
  {
    type: 'message',
    from: 'claude',
    to: 'agent',
    label: 'tool_use',
    code: true,
    reply: true,
    description: 'Claude plans and asks for a tool, for example get_thread_history to check earlier emails.',
  },
  {
    type: 'message',
    from: 'agent',
    to: 'tools',
    label: 'execute(name, input)',
    code: true,
    description: 'The agent runs the tool. A tool that fails returns an error to Claude instead of crashing the run.',
  },
  {
    type: 'message',
    from: 'tools',
    to: 'guards',
    label: 'check(draft, time)',
    code: true,
    description: 'Before anything is queued or sent, schedule_followup and send_email_now ask the safeguards.',
  },
  {
    type: 'message',
    from: 'guards',
    to: 'tools',
    label: 'verdict',
    reply: true,
    description: 'The safeguards allow it, moving the time into the 24-hour gap and business hours, or block it with the reasons.',
  },
  {
    type: 'message',
    from: 'tools',
    to: 'db',
    label: 'read · write · audit log',
    description: 'Tools read the thread and earlier follow-ups, store the follow-up, and log the action with the run id.',
  },
  {
    type: 'message',
    from: 'tools',
    to: 'agent',
    label: 'result',
    reply: true,
    description: 'The tool returns its result: history, a suggested time, or whether the follow-up was scheduled or blocked.',
  },
  {
    type: 'message',
    from: 'agent',
    to: 'claude',
    label: 'tool_result',
    code: true,
    description: 'The result goes back to Claude, which decides the next step.',
  },
  { type: 'loop-end' },
  {
    type: 'message',
    from: 'claude',
    to: 'agent',
    label: 'decision + summary',
    reply: true,
    description: 'After record_decision, Claude ends the run with a short summary of what it did and why.',
  },
  {
    type: 'message',
    from: 'agent',
    to: 'you',
    label: 'live steps + result',
    reply: true,
    description: 'Each step streamed to your screen as it happened. The result shows the decision, the reasons and the draft.',
  },
  { type: 'divider', label: 'Later, when the follow-up is due' },
  {
    type: 'message',
    from: 'agent',
    to: 'guards',
    label: 'check again before sending',
    description: 'The scheduler re-checks the conversation. A reply, an opt-out or a closed conversation cancels the follow-up.',
  },
  {
    type: 'message',
    from: 'guards',
    to: 'agent',
    label: 'still OK to send',
    reply: true,
    description: 'Nothing changed, so the follow-up can go out.',
  },
  {
    type: 'message',
    from: 'agent',
    to: 'email',
    label: 'send(to, subject, body)',
    code: true,
    description: 'The email tool sends it over SMTP, or writes it to the mock outbox in demo mode.',
  },
  {
    type: 'message',
    from: 'email',
    to: 'db',
    label: 'outbox row',
    description: 'Every send attempt is stored with the intended and the actual recipient.',
  },
  {
    type: 'message',
    from: 'agent',
    to: 'db',
    label: 'mark sent + audit log',
    description: 'The follow-up is marked sent and the send is written to the audit log.',
  },
]

/* ------------------------------------------------------------------ layout */

const WIDTH = 960
const MARGIN_X = 72
const SPACING = (WIDTH - 2 * MARGIN_X) / (ACTORS.length - 1)
const BOX_W = 120
const BOX_H = 48
const BOX_Y = 8
const FRAME_X = 20
const ROW_H = 40
const FONT = 12

const actorX = (id: ActorId) => MARGIN_X + ACTORS.findIndex((a) => a.id === id) * SPACING

type LaidMessage = Message & { n: number; y: number }

interface Laid {
  messages: LaidMessage[]
  loops: { top: number; bottom: number; label: string }[]
  dividers: { y: number; label: string }[]
  /** The list version: messages, plus a note where a loop or a later phase starts. */
  list: ({ kind: 'message'; message: LaidMessage } | { kind: 'note'; key: string; text: string })[]
  height: number
}

function layout(rows: Row[]): Laid {
  const out: Laid = { messages: [], loops: [], dividers: [], list: [], height: 0 }
  let y = BOX_Y + BOX_H + 40
  let n = 0
  let loopTop = 0
  let loopLabel = ''
  let loopFirst = 0
  let loopNote: { kind: 'note'; key: string; text: string } | null = null
  for (const row of rows) {
    if (row.type === 'message') {
      n += 1
      const message = { ...row, n, y }
      out.messages.push(message)
      out.list.push({ kind: 'message', message })
      y += ROW_H
    } else if (row.type === 'loop-start') {
      loopTop = y - 22
      loopLabel = row.label
      loopFirst = n + 1
      loopNote = { kind: 'note', key: `loop-${loopFirst}`, text: '' }
      out.list.push(loopNote)
      y += 26
    } else if (row.type === 'loop-end') {
      out.loops.push({ top: loopTop, bottom: y - 18, label: loopLabel })
      if (loopNote) loopNote.text = `Steps ${loopFirst} to ${n} repeat until Claude records its decision, at most 15 turns.`
      y += 14
    } else {
      out.dividers.push({ y: y - 6, label: row.label })
      out.list.push({ kind: 'note', key: `divider-${n}`, text: row.label })
      y += 40
    }
  }
  out.height = y - 4
  return out
}

const LAID = layout(ROWS)
const MESSAGES = LAID.messages

/** Text with a halo in the card colour, so labels stay readable where they cross lifelines. */
const HALO = { paintOrder: 'stroke', strokeWidth: 5, strokeLinejoin: 'round' } as const

function Arrow({ m }: { m: LaidMessage }) {
  const x1 = actorX(m.from)
  const x2 = actorX(m.to)
  const dir = x2 > x1 ? 1 : -1
  const tipX = x2 - dir * 1
  const headBase = tipX - dir * 8
  const mid = (x1 + x2) / 2
  return (
    <g>
      <line
        x1={x1}
        y1={m.y}
        x2={m.reply ? tipX : headBase + dir}
        y2={m.y}
        strokeWidth={1.25}
        strokeDasharray={m.reply ? '4 3' : undefined}
        className={m.reply ? 'stroke-muted' : 'stroke-foreground'}
      />
      {m.reply ? (
        <polyline
          points={`${headBase},${m.y - 4} ${tipX},${m.y} ${headBase},${m.y + 4}`}
          fill="none"
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-muted"
        />
      ) : (
        <polygon points={`${headBase},${m.y - 4} ${tipX},${m.y} ${headBase},${m.y + 4}`} className="fill-foreground" />
      )}
      <text x={mid} y={m.y - 8} textAnchor="middle" fontSize={FONT} style={HALO} className="stroke-surface">
        <tspan className="fill-subtle font-mono" fontSize={FONT - 1}>
          {m.n}
        </tspan>
        <tspan dx={6} className={cn(m.code ? 'font-mono' : 'font-sans', m.reply ? 'fill-muted' : 'fill-foreground')}>
          {m.label}
        </tspan>
      </text>
    </g>
  )
}

export function SequenceDiagram({ className }: { className?: string }) {
  const titleId = useId()
  const descId = useId()
  const { loops, dividers, height } = LAID
  const lifelineEnd = height - 8

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border bg-surface px-3 py-4 sm:px-5">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          className="mx-auto block h-auto w-full max-w-[1040px] min-w-[880px] font-sans"
        >
          <title id={titleId}>Sequence of one follow-up</title>
          <desc id={descId}>
            You start a run; the agent and Claude repeat a tool-use loop in which tools ask the safeguards before writing to MySQL; later the
            scheduler re-checks the conversation and the email tool sends the follow-up. The same steps are listed below the diagram.
          </desc>

          {/* lifelines */}
          {ACTORS.map((a) => (
            <line
              key={`life-${a.id}`}
              x1={actorX(a.id)}
              y1={BOX_Y + BOX_H}
              x2={actorX(a.id)}
              y2={lifelineEnd}
              strokeWidth={1}
              strokeDasharray="2 4"
              className="stroke-border-strong"
            />
          ))}

          {/* loop frames */}
          {loops.map((loop, i) => (
            <g key={`loop-${i}`}>
              <rect
                x={FRAME_X}
                y={loop.top}
                width={WIDTH - 2 * FRAME_X}
                height={loop.bottom - loop.top}
                rx={6}
                fill="none"
                strokeWidth={1}
                className="stroke-border-strong"
              />
              <path
                d={`M${FRAME_X + 6} ${loop.top} H${FRAME_X + 52} V${loop.top + 14} L${FRAME_X + 44} ${loop.top + 22} H${FRAME_X} V${loop.top + 6} Q${FRAME_X} ${loop.top} ${FRAME_X + 6} ${loop.top} Z`}
                strokeWidth={1}
                className="fill-surface-2 stroke-border-strong"
              />
              <text x={FRAME_X + 10} y={loop.top + 15} fontSize={FONT - 1} className="fill-foreground font-mono">
                loop
              </text>
              <text x={FRAME_X + 64} y={loop.top + 15} fontSize={FONT - 1} style={HALO} className="fill-muted stroke-surface font-mono">
                [{loop.label}]
              </text>
            </g>
          ))}

          {/* section dividers */}
          {dividers.map((d) => {
            const w = d.label.length * 6.6 + 28
            return (
              <g key={`divider-${d.y}`}>
                <line x1={FRAME_X} y1={d.y} x2={WIDTH - FRAME_X} y2={d.y} strokeWidth={1} strokeDasharray="6 4" className="stroke-border-strong" />
                <rect x={WIDTH / 2 - w / 2} y={d.y - 12} width={w} height={24} rx={12} strokeWidth={1} className="fill-surface stroke-border-strong" />
                <text x={WIDTH / 2} y={d.y + 4} textAnchor="middle" fontSize={FONT} className="fill-muted">
                  {d.label}
                </text>
              </g>
            )
          })}

          {/* messages */}
          {MESSAGES.map((m) => (
            <Arrow key={`msg-${m.n}`} m={m} />
          ))}

          {/* actor boxes (drawn last so lifelines start under them) */}
          {ACTORS.map((a) => (
            <g key={`actor-${a.id}`}>
              <rect
                x={actorX(a.id) - BOX_W / 2}
                y={BOX_Y}
                width={BOX_W}
                height={BOX_H}
                rx={8}
                strokeWidth={1}
                className="fill-surface-2 stroke-border-strong"
              />
              <text x={actorX(a.id)} y={BOX_Y + 21} textAnchor="middle" fontSize={13} fontWeight={500} className="fill-foreground">
                {a.name}
              </text>
              <text x={actorX(a.id)} y={BOX_Y + 37} textAnchor="middle" fontSize={FONT - 1} className="fill-subtle font-mono">
                {a.sub}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <details className="group rounded-lg border border-border bg-surface">
        <summary className="flex list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-4 text-muted transition-transform duration-150 group-open:rotate-90" />
          Read the diagram as a list
        </summary>
        <ol className="flex flex-col gap-3 border-t border-border px-4 py-4">
          {LAID.list.map((item) =>
            item.kind === 'note' ? (
              <li key={item.key} className="pt-1 text-xs font-medium text-subtle first:pt-0">
                {item.text}
              </li>
            ) : (
              <li key={`item-${item.message.n}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 text-sm">
                <span className="pt-px font-mono text-xs text-subtle tabular-nums">{String(item.message.n).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {ACTOR_NAME[item.message.from]}
                    <span aria-hidden className="px-1.5 text-subtle">
                      →
                    </span>
                    <span className="sr-only"> to </span>
                    {ACTOR_NAME[item.message.to]}
                    <span className={cn('ml-2 font-normal text-muted', item.message.code && 'font-mono text-xs')}>{item.message.label}</span>
                  </p>
                  <p className="mt-0.5 text-muted">{item.message.description}</p>
                </div>
              </li>
            ),
          )}
        </ol>
      </details>
    </div>
  )
}
