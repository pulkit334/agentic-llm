import { BrainCircuit, Database, Mail, ScrollText, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AGENT_TOOLS } from '@/lib/product'
import { SECTIONS } from './content'
import { Section } from './section'

interface Part {
  icon: LucideIcon
  title: string
  description: string
}

const PARTS: Part[] = [
  {
    icon: BrainCircuit,
    title: 'Claude tool-use loop',
    description:
      'Claude plans, calls tools and reads their results for up to 15 turns, then records its decision. If the API is unavailable, the run continues on built-in rules that use the same tools and return the same result.',
  },
  {
    icon: Database,
    title: 'MySQL',
    description:
      'Contacts, conversations, messages, the follow-up queue, the outbox and the audit log. Times are stored in UTC and shown in each recipient’s own time zone.',
  },
  {
    icon: Mail,
    title: 'SMTP or mock email',
    description:
      'Mock mode writes every email to an outbox table. SMTP mode sends real email that threads with the conversation, and a redirect address can catch every message during a demo.',
  },
  {
    icon: ScrollText,
    title: 'Audit log',
    description:
      'Each tool call, block, send, cancellation and decision is logged with its run ID, so you can see exactly what happened and why.',
  },
]

/** Architecture in four parts, plus the agent's tool list. */
export function UnderTheHoodSection() {
  const { id, label } = SECTIONS.underTheHood
  return (
    <Section
      id={id}
      eyebrow={label}
      title="Built to be inspected."
      description="Every decision traces back to a tool call and a written reason, in the app and in the database."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <ul className="divide-y divide-border border-y border-border">
          {PARTS.map((part) => (
            <li key={part.title} className="flex gap-4 py-5">
              <part.icon aria-hidden className="mt-[3px] size-4 shrink-0 text-foreground" />
              <div>
                <h3 className="text-base font-medium text-foreground">{part.title}</h3>
                <p className="mt-1 text-base text-muted">{part.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-4">
            <h3 className="text-base font-medium text-foreground">The agent’s {AGENT_TOOLS.length} tools</h3>
            <p className="text-xs text-subtle">
              <code className="font-mono">followup/tools.py</code>
            </p>
          </div>
          <ul className="divide-y divide-border">
            {AGENT_TOOLS.map((tool) => (
              <li key={tool.name} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <code className="font-mono text-sm text-foreground">{tool.name}</code>
                  <p className="mt-0.5 text-sm text-muted">{tool.purpose}</p>
                </div>
                <Badge tone={tool.writes ? 'neutral' : 'outline'} size="sm" className="mt-0.5">
                  {tool.writes ? 'Writes' : 'Reads'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}
