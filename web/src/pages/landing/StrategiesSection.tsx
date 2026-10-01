import { Briefcase, GraduationCap, Handshake, UserRound, type LucideIcon } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ContactType, Strategy } from '@/lib/api'
import { CONTACT_TYPES, contactTypeLabel, formatHours } from '@/lib/format'
import { BUSINESS_HOURS, DEADLINE_MIN_GAP_HOURS, MIN_GAP_HOURS, STRATEGIES } from '@/lib/product'
import { SECTIONS, sentenceCase } from './content'
import { Section } from './section'

const TYPE_ICONS: Record<ContactType, LucideIcon> = {
  customer: UserRound,
  student: GraduationCap,
  employee: Briefcase,
  business: Handshake,
}

/** "60-110 words" -> "60–110 words" (en dash for ranges). */
function range(text: string) {
  return text.replace(/(\d)-(\d)/g, '$1–$2')
}

function deadlineNote(strategy: Strategy): string | null {
  return strategy.deadline_lead_hours ? `or ${formatHours(strategy.deadline_lead_hours)} before a deadline, if sooner` : null
}

function TypeName({ type }: { type: ContactType }) {
  const Icon = TYPE_ICONS[type]
  return (
    <span className="inline-flex items-center gap-2 font-medium text-foreground">
      <Icon aria-hidden className="size-4 text-muted" />
      {contactTypeLabel(type)}
    </span>
  )
}

/** Per-recipient-type strategy (followup/strategies.py), as a table on wide screens and a list on phones. */
export function StrategiesSection() {
  const { id, label } = SECTIONS.strategies
  return (
    <Section
      id={id}
      eyebrow={label}
      title="A different follow-up for each kind of recipient."
      description="The contact type decides how long to wait, how many follow-ups are allowed and how the email should sound."
    >
      {/* Wide screens: one table. */}
      <div className="hidden md:block">
        <Table className="text-base">
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>First follow-up</TableHead>
              <TableHead className="text-right">Max follow-ups</TableHead>
              <TableHead>Tone</TableHead>
              <TableHead>Focus</TableHead>
              <TableHead>Length</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CONTACT_TYPES.map((type) => {
              const s = STRATEGIES[type]
              const note = deadlineNote(s)
              return (
                <TableRow key={type}>
                  <TableCell className="py-4 align-top whitespace-nowrap">
                    <TypeName type={type} />
                  </TableCell>
                  <TableCell className="py-4 align-top">
                    <span className="whitespace-nowrap text-foreground">After {formatHours(s.delay_hours)}</span>
                    {note ? <span className="mt-0.5 block text-sm text-muted">{sentenceCase(note)}</span> : null}
                  </TableCell>
                  <TableCell className="py-4 text-right align-top whitespace-nowrap text-foreground tabular-nums">{s.max_followups}</TableCell>
                  <TableCell className="py-4 align-top text-muted">{sentenceCase(s.tone)}</TableCell>
                  <TableCell className="py-4 align-top text-muted">{sentenceCase(s.focus)}</TableCell>
                  <TableCell className="py-4 align-top whitespace-nowrap text-muted tabular-nums">{range(s.length)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Phones: one block per recipient type. */}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface md:hidden">
        {CONTACT_TYPES.map((type) => {
          const s = STRATEGIES[type]
          const note = deadlineNote(s)
          return (
            <li key={type} className="px-4 py-4">
              <TypeName type={type} />
              <dl className="mt-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-subtle">First follow-up</dt>
                <dd className="text-foreground">
                  After {formatHours(s.delay_hours)}
                  {note ? <span className="block text-muted">{sentenceCase(note)}</span> : null}
                </dd>
                <dt className="text-subtle">Max follow-ups</dt>
                <dd className="text-foreground tabular-nums">{s.max_followups}</dd>
                <dt className="text-subtle">Tone</dt>
                <dd className="text-muted">{sentenceCase(s.tone)}</dd>
                <dt className="text-subtle">Focus</dt>
                <dd className="text-muted">{sentenceCase(s.focus)}</dd>
                <dt className="text-subtle">Length</dt>
                <dd className="text-muted">{range(s.length)}</dd>
              </dl>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 max-w-3xl text-sm text-muted">
        Every send time is then moved into {BUSINESS_HOURS}, and kept at least {MIN_GAP_HOURS} hours after our last email. A student or employee
        reminder may use {DEADLINE_MIN_GAP_HOURS} hours when that is the only way to arrive before the deadline. Values from{' '}
        <code className="font-mono text-xs text-foreground">followup/strategies.py</code>.
      </p>
    </Section>
  )
}
