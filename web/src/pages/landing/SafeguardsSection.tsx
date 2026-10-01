import { BellOff, CalendarClock, CopyX, Hourglass, ListOrdered, Reply, ShieldCheck, TextQuote, type LucideIcon } from 'lucide-react'
import { Code } from '@/components/ui/code'
import { OPT_OUT_PHRASES, SAFEGUARDS } from '@/lib/product'
import { SECTIONS } from './content'
import { Section } from './section'

const ICONS: Record<string, LucideIcon> = {
  'one-pending': CopyX,
  'no-chase-after-reply': Reply,
  'opt-outs': BellOff,
  'max-per-type': ListOrdered,
  'min-gap': Hourglass,
  'business-hours': CalendarClock,
  recheck: ShieldCheck,
  'identical-text': TextQuote,
}

/** The hard rules enforced in code (followup/guards.py and the scheduler). */
export function SafeguardsSection() {
  const { id, label } = SECTIONS.safeguards
  return (
    <Section
      id={id}
      eyebrow={label}
      title="Claude decides. Code enforces."
      description="These rules run inside the tools, before anything is queued or sent. A wrong call by the model can never produce a duplicate or an unwanted email."
    >
      <ul className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {SAFEGUARDS.map((rule) => {
          const Icon = ICONS[rule.id] ?? ShieldCheck
          return (
            <li key={rule.id} className="bg-background p-5">
              <Icon aria-hidden className="size-4 text-foreground" />
              <h3 className="mt-4 text-base font-medium text-foreground">{rule.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{rule.description}</p>
            </li>
          )
        })}
      </ul>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-4">
        <p className="shrink-0 text-sm text-muted">Opt-out phrases it listens for</p>
        <ul aria-label="Opt-out phrases" className="flex flex-wrap gap-1.5">
          {OPT_OUT_PHRASES.map((phrase) => (
            <li key={phrase}>
              <Code>{phrase}</Code>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
